// app/api/brand-voice/route.ts
import { NextResponse } from "next/server";
import { getBrandVoice, saveBrandVoice } from "@/lib/brand-voice";

export const dynamic = "force-dynamic";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function getToken(): Promise<{ token: string; igUserId: string } | null> {
  try {
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;
    if (!igUserId) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return null;
    const res = await fetch(`${url}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&select=access_token&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    const rows = await res.json();
    return rows?.[0]?.access_token ? { token: rows[0].access_token, igUserId } : null;
  } catch {
    return null;
  }
}

// Analyzes the account's bio + recent captions to draft a brand voice.
async function detectBrandVoice(): Promise<any | null> {
  const key = process.env.GEMINI_API_KEY;
  const conn = await getToken();
  if (!key || !conn) return null;
  try {
    const meRes = await fetch(`https://graph.instagram.com/me?fields=username,name,biography&access_token=${conn.token}`, { cache: "no-store" });
    const me = await meRes.json();
    const mediaRes = await fetch(`https://graph.instagram.com/me/media?fields=caption&limit=12&access_token=${conn.token}`, { cache: "no-store" });
    const media = await mediaRes.json();
    const captions = (media?.data || []).map((m: any) => m.caption).filter(Boolean).slice(0, 10);

    const prompt = `You are a brand strategist. Analyze this Instagram creator's bio and real captions, then infer their brand voice profile. Respond with JSON only — no markdown.

Bio: ${me.biography || "(none)"}
Name: ${me.name || me.username}
Recent captions:
${captions.map((c: string, i: number) => `${i + 1}. ${c.slice(0, 200)}`).join("\n") || "(no captions available)"}

Return exactly:
{"tone":"...","audience":"...","products":"...","emoji_style":"...","dos":"...","donts":"...","sample_caption":"..."}

RULES:
- Infer tone from how they ACTUALLY write (playful? poetic? direct? professional?).
- Infer audience from bio + content themes.
- products: what they seem to offer/promote, or "none obvious" if unclear.
- emoji_style: describe their real emoji habits from the captions.
- dos: 1-2 patterns they consistently use worth keeping.
- donts: 1 thing to avoid based on their style.
- sample_caption: pick their single best real caption as the reference (use one from the list).
- Base everything on evidence from their actual content. Be specific, not generic.`;

    for (const model of MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        if (!res.ok) continue;
        const d = await res.json();
        const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = JSON.parse(t.replace(/```json|```/g, "").trim());
        if (parsed?.tone) return parsed;
      } catch { continue; }
    }
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const v = await getBrandVoice();
  // If empty and the user asked to auto-detect, analyze their IG.
  const wantDetect = new URL(req.url).searchParams.get("detect") === "1";
  const isEmpty = !v || !Object.values(v).some((x) => x && String(x).trim());
  if (wantDetect && isEmpty) {
    const detected = await detectBrandVoice();
    if (detected) return NextResponse.json({ voice: detected, detected: true });
  }
  return NextResponse.json({ voice: v || {}, detected: false });
}

export async function POST(req: Request) {
  try {
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;
    if (!igUserId) {
      return NextResponse.json({ error: "Connect Instagram first to save your brand voice." }, { status: 400 });
    }
    const body = await req.json();
    const ok = await saveBrandVoice(igUserId, {
      tone: body.tone,
      audience: body.audience,
      products: body.products,
      emoji_style: body.emoji_style,
      dos: body.dos,
      donts: body.donts,
      faqs: body.faqs,
      sample_caption: body.sample_caption,
    });
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
