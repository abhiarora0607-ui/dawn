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
import { getPersona, personaPrompt } from "@/lib/persona";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function aiReply(commentText: string, voicePrompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const prompt = `You are the creator behind this Instagram account, personally replying to a comment on your own post. Write ONE reply that sounds unmistakably human and genuinely engaged — the kind of reply that makes a follower feel seen and keeps them coming back.

THE COMMENT: "${commentText}"

RULES:
- Max 20 words. Short, warm, real.
- Match the energy of the comment — playful gets playful, a question gets a genuine answer, praise gets grateful-not-robotic.
- NO generic filler like "Thanks so much! 💛" unless the comment truly warrants nothing more.
- Sound like a specific human, never a brand bot. No corporate tone.
- 0-1 emoji, only if natural. No hashtags.
- If it's a question you can't answer from context, respond warmly and invite a DM.${voicePrompt}

Your reply (text only, no quotes):`;
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
  if (!settings?.comment_enabled && !settings?.dm_enabled) {
    return NextResponse.json({ ok: true, replied: 0, note: "Both automations are off." });
  }

  const [voice, persona] = await Promise.all([getBrandVoice(), getPersona()]);
  const voicePrompt = brandVoicePrompt(voice) + personaPrompt(persona);

  let replied = 0;
  let dmReplied = 0;
  const drafts: any[] = [];
  const dmDrafts: any[] = [];

  // ── COMMENTS ──────────────────────────────────────────────
  if (settings?.comment_enabled) {
    try {
      const mediaRes = await fetch(`https://graph.instagram.com/me/media?fields=id&limit=10&access_token=${token}`, { cache: "no-store" });
      const media = await mediaRes.json();
      for (const m of media?.data || []) {
        const cRes = await fetch(`https://graph.instagram.com/${m.id}/comments?fields=id,text,username,from,replies&access_token=${token}`, { cache: "no-store" });
        const comments = await cRes.json();
        for (const c of comments?.data || []) {
          // Skip our own comments (don't reply to ourselves)
          if (c.from?.id && c.from.id === igUserId) continue;
          // Skip if we've already replied in this thread
          const alreadyReplied = (c.replies?.data || []).some((r: any) => r.from?.id === igUserId);
          if (alreadyReplied) continue;
          const replyText = settings.comment_mode === "fixed"
            ? (settings.comment_fixed_reply || "Thanks so much! 💛")
            : (await aiReply(c.text || "", voicePrompt)) || (settings.comment_fixed_reply || "Thanks so much! 💛");
          const postRes = await fetch(`https://graph.instagram.com/${c.id}/replies`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: replyText, access_token: token }),
          });
          if (postRes.ok) { replied++; drafts.push({ comment: c.text, reply: replyText, username: c.username }); }
          if (replied >= 10) break;
        }
        if (replied >= 10) break;
      }
    } catch {
      // continue to DMs even if comments fail
    }
  }

  // ── DMs ───────────────────────────────────────────────────
  // Instagram only allows replying within 24h of the user's last message.
  if (settings?.dm_enabled) {
    try {
      // Fetch recent conversations
      const convRes = await fetch(`https://graph.instagram.com/me/conversations?fields=id,messages{id,message,from,created_time}&access_token=${token}`, { cache: "no-store" });
      const convs = await convRes.json();
      for (const conv of convs?.data || []) {
        const msgs = conv.messages?.data || [];
        if (!msgs.length) continue;
        // Most recent message; only reply if it's FROM the other person (not us)
        const latest = msgs[0];
        // Determine our own id to avoid replying to ourselves
        const fromId = latest?.from?.id;
        if (!fromId || fromId === igUserId) continue;

        const replyText = settings.dm_mode === "fixed"
          ? (settings.dm_fixed_reply || "Thanks for reaching out! 💛")
          : (await aiReply(latest.message || "", voicePrompt)) || (settings.dm_fixed_reply || "Thanks for reaching out! 💛");

        const sendRes = await fetch(`https://graph.instagram.com/me/messages`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { id: fromId }, message: { text: replyText }, access_token: token }),
        });
        if (sendRes.ok) { dmReplied++; dmDrafts.push({ message: latest.message, reply: replyText }); }
        if (dmReplied >= 10) break;
      }
    } catch {
      // DM failures are non-fatal
    }
  }

  return NextResponse.json({ ok: true, replied, drafts, dmReplied, dmDrafts });
}
