// app/api/content/route.ts
// Generates content ideas for the connected account using Gemini
// (free tier) with a deterministic fallback so it always works.

import { NextResponse } from "next/server";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";

export const dynamic = "force-dynamic";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function aiIdeas(account: any, voicePrompt: string): Promise<any[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `You are Dawn — a viral content strategist who has engineered thousands of high-performing Instagram posts. You understand hooks, pattern interrupts, saves-vs-likes psychology, and format-market fit. Generate 5 post ideas TAILORED to this specific account that they could shoot and publish this week.

ACCOUNT: ${JSON.stringify({
    handle: account.handle,
    niche: account.niche,
    audiencePrefers: account.audiencePrefers,
    topPost: account.topPost,
  })}${voicePrompt}

Respond with JSON only — no markdown:
[{"format":"Reel|Carousel|Story|Image","hook":"the exact first line/on-screen text that stops the scroll","idea":"the specific concept — what they actually shoot/show, 1 sentence","cta":"a specific call to action that drives saves, shares, or comments"}]

STRATEGIST RULES:
- 5 ideas, deliberately varied across formats (don't give 5 Reels).
- Each hook must be a real, usable first line — a pattern interrupt, bold claim, curiosity gap, or relatable POV. Not a topic label.
- Lean hard into what their audience already rewards (${account.audiencePrefers}) — build on their proven winners, don't reinvent.
- Ideas must be specific and shootable for THIS niche, never generic ("post a motivational quote" is banned).
- CTAs should be engineered for the algorithm: prompt saves ("save this for later"), shares ("tag someone who…"), or comments ("what's your…?").
- Write hooks a real top creator in their niche would actually use.`;

  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function fallbackIdeas(account: any): any[] {
  const fmt = account.topPost?.format || "Reel";
  return [
    { format: "Reel", hook: "The one thing nobody tells you about " + (account.niche || "this"), idea: "A myth-busting educational Reel — your audience prefers " + account.audiencePrefers + ".", cta: "Save this for later" },
    { format: "Carousel", hook: "5 mistakes to avoid", idea: "A swipeable list post breaking down common mistakes in your niche.", cta: "Which one surprised you? Comment below" },
    { format: "Story", hook: "Behind the scenes today", idea: "A raw, unpolished look at your day — builds trust and connection.", cta: "Reply with your questions" },
    { format: fmt, hook: "This worked, so here's the sequel", idea: `Repurpose your top post ("${(account.topPost?.caption || "").slice(0, 40)}…") with a fresh angle.`, cta: "Follow for part 2" },
    { format: "Reel", hook: "POV: you finally figured it out", idea: "A relatable, aspirational Reel that mirrors your audience's goals.", cta: "Tag someone who needs this" },
  ];
}

export async function GET() {
  let account;
  try {
    account = await (await getProviderAsync()).getAccount();
  } catch {
    account = await getProvider().getAccount();
  }
  const voice = await getBrandVoice();
  const voicePrompt = brandVoicePrompt(voice);
  const ideas = (await aiIdeas(account, voicePrompt)) ?? fallbackIdeas(account);
  return NextResponse.json({ ideas, account: { handle: account.handle, displayName: account.displayName, niche: account.niche } });
}
