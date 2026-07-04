// app/api/automation/run/route.ts
// The real automation engine. When called, it:
//  1. loads the account's automation settings + token
//  2. fetches recent comments on recent media
//  3. for comments without a reply from the account, generates a reply
//     (AI or fixed) and posts it via the Graph API
// This is invoked manually (a "Run now" button) for the MVP; a scheduled
// cron can call the same endpoint later.

import { NextResponse } from "next/server";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function aiReply(commentText: string, voicePrompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = `You are replying to a comment on your own Instagram post. Write ONE short, natural, friendly reply (max 20 words). No quotes, no hashtags unless natural. Sound human, not corporate.${voicePrompt}

Comment: "${commentText}"

Your reply:`;
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text.replace(/^["']|["']$/g, "").trim();
    } catch { continue; }
  }
  return null;
}

async function sb(path: string, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  return res.json();
}

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  let igUserId: string | null = null;
  try {
    const { cookies } = await import("next/headers");
    igUserId = cookies().get("dawn_ig")?.value ?? null;
  } catch {}
  if (!igUserId || !url || !key) {
    return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
  }

  // Load settings + token
  const [settingsRows, connRows] = await Promise.all([
    sb(`automation_settings?ig_user_id=eq.${igUserId}&select=*&limit=1`, key, url),
    sb(`ig_connections?ig_user_id=eq.${igUserId}&select=access_token&limit=1`, key, url),
  ]);
  const settings = settingsRows?.[0];
  const token = connRows?.[0]?.access_token;
  if (!token) return NextResponse.json({ error: "No token." }, { status: 400 });
  if (!settings?.comment_enabled) {
    return NextResponse.json({ ok: true, replied: 0, note: "Comment automation is off." });
  }

  const voice = await getBrandVoice();
  const voicePrompt = brandVoicePrompt(voice);

  // Fetch recent media
  let replied = 0;
  const drafts: any[] = [];
  try {
    const mediaRes = await fetch(`https://graph.instagram.com/me/media?fields=id&limit=5&access_token=${token}`, { cache: "no-store" });
    const media = await mediaRes.json();
    for (const m of media?.data || []) {
      // Fetch comments on this media
      const cRes = await fetch(`https://graph.instagram.com/${m.id}/comments?fields=id,text,username,replies&access_token=${token}`, { cache: "no-store" });
      const comments = await cRes.json();
      for (const c of comments?.data || []) {
        // Skip if we've already replied (has replies) — simple heuristic
        if (c.replies?.data?.length) continue;
        const replyText = settings.comment_mode === "fixed"
          ? (settings.comment_fixed_reply || "Thanks so much! 💛")
          : (await aiReply(c.text || "", voicePrompt)) || (settings.comment_fixed_reply || "Thanks so much! 💛");

        // Post the reply
        const postRes = await fetch(`https://graph.instagram.com/${c.id}/replies`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: replyText, access_token: token }),
        });
        if (postRes.ok) { replied++; drafts.push({ comment: c.text, reply: replyText, username: c.username }); }
        if (replied >= 10) break; // safety cap per run
      }
      if (replied >= 10) break;
    }
  } catch (e) {
    return NextResponse.json({ error: "Run failed — check permissions." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, replied, drafts });
}
