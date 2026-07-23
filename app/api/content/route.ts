// app/api/content/route.ts
// Generates content ideas for the connected account using Gemini
// (free tier) with a deterministic fallback so it always works.

import { parseAiJson, aiText, aiTextList } from "@/lib/ai-prompt";
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getProviderAsync, getProvider } from "@/lib/data-provider";
import { getBrandVoice, brandVoicePrompt } from "@/lib/brand-voice";
import { getPersona, personaPrompt } from "@/lib/persona";

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
      const parsed = parseAiJson<any[]>(text, []);
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

export async function POST(req: Request) {
  { // Billing: Instagram & AI is a plan area. Portal access needs content_tools.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
    if (!_uid) {
      // V54: an employee reaches the studio only if an admin granted the
      // content_tools permission — and the business's plan still applies.
      const { guardEmployee, hasPermission } = await import("@/lib/employee-auth");
      const g = await guardEmployee();
      if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
      if (!hasPermission(g.ctx, "content_tools")) {
        return NextResponse.json({ error: "You don't have access to content tools." }, { status: 403 });
      }
      if (_url && _key) {
        const _area = await requireArea(_url, _key, g.ctx.uid, "instagram_ai");
        if (_area) return NextResponse.json(_area, { status: 403 });
      }
    }
  }
  // Expand a single idea into a full shot plan + caption + hashtags.
  const key = process.env.GEMINI_API_KEY;
  let idea: any = {};
  try { idea = (await req.json()).idea || {}; } catch {}
  if (!key || !idea.hook) {
    return NextResponse.json({ error: "Missing idea." }, { status: 400 });
  }
  let account;
  try { account = await (await getProviderAsync()).getAccount(); } catch { account = await getProvider().getAccount(); }
  const [voice, persona] = await Promise.all([getBrandVoice(), getPersona()]);
  const voicePrompt = brandVoicePrompt(voice) + personaPrompt(persona);

  const prompt = `You are Dawn — a viral content director. Expand this post idea into a complete, ready-to-execute plan for an Instagram creator. Respond with JSON only — no markdown.

THE IDEA: ${JSON.stringify(idea)}
ACCOUNT NICHE: ${account.niche}, audience prefers: ${account.audiencePrefers}${voicePrompt}

Return exactly:
{
  "hook": "the refined on-screen hook / first line",
  "shotPlan": ["step-by-step: what to shoot/show, 3-5 concrete steps or shots"],
  "caption": "a full ready-to-post caption in their voice",
  "hashtags": ["8-12 relevant hashtags with #"],
  "bestTime": "suggested post time and why",
  "proTips": ["2-3 specific tips to maximize saves/shares/reach for THIS idea"]
}

RULES: be concrete and executable — a creator should be able to follow shotPlan literally. Caption must be genuinely good, not generic. Tips must be specific to this idea, not generic advice.`;

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
      if (parsed?.caption) {
        // Guarantee the shape the UI renders: shotPlan/proTips/hashtags as
        // clean string arrays, the rest as text — so a model returning
        // {step:"…"} objects can't crash the content screen (React #31).
        return NextResponse.json({
          hook: aiText(parsed.hook),
          shotPlan: aiTextList(parsed.shotPlan),
          caption: aiText(parsed.caption),
          hashtags: aiTextList(parsed.hashtags),
          bestTime: aiText(parsed.bestTime),
          proTips: aiTextList(parsed.proTips),
        });
      }
    } catch { continue; }
  }
  return NextResponse.json({ error: "Couldn't expand this idea. Try again." }, { status: 500 });
}

export async function GET() {
  { // Billing: Instagram & AI is a plan area. Portal access needs content_tools.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
    if (!_uid) {
      // V54: an employee reaches the studio only if an admin granted the
      // content_tools permission — and the business's plan still applies.
      const { guardEmployee, hasPermission } = await import("@/lib/employee-auth");
      const g = await guardEmployee();
      if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
      if (!hasPermission(g.ctx, "content_tools")) {
        return NextResponse.json({ error: "You don't have access to content tools." }, { status: 403 });
      }
      if (_url && _key) {
        const _area = await requireArea(_url, _key, g.ctx.uid, "instagram_ai");
        if (_area) return NextResponse.json(_area, { status: 403 });
      }
    }
  }
  let account;
  try {
    account = await (await getProviderAsync()).getAccount();
  } catch {
    account = await getProvider().getAccount();
  }
  const [voice, persona] = await Promise.all([getBrandVoice(), getPersona()]);
  const voicePrompt = brandVoicePrompt(voice) + personaPrompt(persona);
  const ideas = (await aiIdeas(account, voicePrompt)) ?? fallbackIdeas(account);
  return NextResponse.json({ ideas, account: { handle: account.handle, displayName: account.displayName, niche: account.niche } });
}
