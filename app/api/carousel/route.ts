// app/api/carousel/route.ts
// Generates a full slide-by-slide Instagram carousel from a topic.

import { DAWN_IDENTITY, JSON_ONLY, accountContext, parseAiJson } from "@/lib/ai-prompt";
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";
import { getPersona, personaPrompt } from "@/lib/persona";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

export async function POST(req: Request) {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const key = process.env.GEMINI_API_KEY;
  let topic = "";
  try { topic = (await req.json()).topic || ""; } catch {}
  if (!key || !topic.trim()) return NextResponse.json({ error: "Enter a topic." }, { status: 400 });

  let account;
  try { account = await (await getProviderAsync()).getAccount(); } catch { account = await getProvider().getAccount(); }
  const [voice, persona] = await Promise.all([getBrandVoice(), getPersona()]);
  const ctx = brandVoicePrompt(voice) + personaPrompt(persona);

  const prompt = `${DAWN_IDENTITY}

You are also a carousel copywriter who engineers save-worthy Instagram carousels. Create a complete carousel on the given topic for this creator. ${JSON_ONLY}

TOPIC: ${topic}

ACCOUNT CONTEXT:
${accountContext(account)}${ctx}

Return exactly:
{"slides":[{"n":1,"headline":"big bold text on the slide","subtext":"supporting line, optional"}],"caption":"the full post caption","hashtags":["#..."]}

RULES:
- 5-8 slides. Slide 1 is the HOOK — it must stop the scroll and promise value. Last slide is a CTA (follow/save/share).
- Each slide: punchy headline (what shows big), plus 1 short supporting line.
- Content must deliver real value on the topic — teach, list, or reveal something.
- Lean into what this audience already rewards (${account.audiencePrefers}); echo the angle of their best post where it fits.
- Caption should expand on the carousel and drive saves.
- Sound on-brand for this creator, never generic.`;

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
      if (parsed?.slides?.length) return NextResponse.json(parsed);
    } catch { continue; }
  }
  return NextResponse.json({ error: "Couldn't generate the carousel. Try again." }, { status: 500 });
}
