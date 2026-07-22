// app/api/calendar/route.ts
// Generates a personalized 7-day content calendar using the account's
// niche, persona, and brand voice.

import { parseAiJson } from "@/lib/ai-prompt";
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";
import { getPersona, personaPrompt } from "@/lib/persona";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

export async function GET() {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const key = process.env.GEMINI_API_KEY;
  let account;
  try { account = await (await getProviderAsync()).getAccount(); } catch { account = await getProvider().getAccount(); }
  const [voice, persona] = await Promise.all([getBrandVoice(), getPersona()]);
  const ctx = brandVoicePrompt(voice) + personaPrompt(persona);

  if (!key) return NextResponse.json({ days: fallback(account) });

  const prompt = `You are Dawn — a content strategist. Build a 7-day Instagram content calendar for this creator that balances formats, keeps their audience engaged, and drives growth. Respond with JSON only — no markdown.

ACCOUNT: niche=${account.niche}, audience prefers=${account.audiencePrefers}, best time=${account.bestTimeToPost}${ctx}

Return exactly:
{"days":[{"day":"Monday","format":"Reel|Carousel|Story|Image","theme":"the content theme for the day","idea":"a specific post idea","hook":"the scroll-stopping first line","bestTime":"suggested time"}]}

RULES:
- Exactly 7 days, Monday through Sunday.
- Deliberately vary formats across the week — don't repeat the same format daily. Mix Reels (growth), Carousels (saves), Stories (engagement), and the occasional Image.
- Each idea must be specific and on-brand for THIS creator, never generic.
- Hooks must be real usable first lines.
- Sequence with intent: strong Reel to open the week, engagement content mid-week, a save-worthy carousel, etc.
- Keep it realistic — a solo creator can actually execute this.`;

  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) continue;
      const d = await res.json();
      const t = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = parseAiJson<any>(t, null);
      if (parsed?.days?.length) return NextResponse.json({ days: parsed.days.slice(0, 7) });
    } catch { continue; }
  }
  return NextResponse.json({ days: fallback(account) });
}

function fallback(account: any) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const formats = ["Reel", "Story", "Carousel", "Reel", "Image", "Reel", "Story"];
  return days.map((day, i) => ({
    day, format: formats[i],
    theme: i % 2 === 0 ? "Education" : "Behind the scenes",
    idea: `A ${formats[i].toLowerCase()} for your ${account.niche || "audience"}.`,
    hook: "Here's something you didn't know…",
    bestTime: account.bestTimeToPost || "7:15 PM",
  }));
}
