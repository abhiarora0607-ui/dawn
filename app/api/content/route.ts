// app/api/content/route.ts
// Generates content ideas for the connected account using Gemini
// (free tier) with a deterministic fallback so it always works.

import { NextResponse } from "next/server";
import { getProviderAsync, getProvider } from "@/lib/data-provider";

export const dynamic = "force-dynamic";

const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function aiIdeas(account: any): Promise<any[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `You are Dawn, an AI Instagram content planner. For this account, generate 5 specific post ideas as JSON only (no markdown).

Account: ${JSON.stringify({
    handle: account.handle,
    niche: account.niche,
    audiencePrefers: account.audiencePrefers,
    topPost: account.topPost,
  })}

Return exactly:
[{"format":"Reel|Carousel|Story|Image","hook":"scroll-stopping first line","idea":"what the post is about, 1 sentence","cta":"call to action"}]

Rules: 5 ideas, varied formats, lean into what their audience prefers, be specific not generic.`;

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
  const ideas = (await aiIdeas(account)) ?? fallbackIdeas(account);
  return NextResponse.json({ ideas, account: { handle: account.handle, displayName: account.displayName, niche: account.niche } });
}
