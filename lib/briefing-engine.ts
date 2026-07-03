// lib/briefing-engine.ts
// ────────────────────────────────────────────────────────────
// Turns account data + competitor signals into the "Good Morning"
// action plan. Uses Google Gemini (free tier) when GEMINI_API_KEY
// is set; otherwise falls back to a deterministic rule-based brief
// so the demo ALWAYS works — even at zero cost with no key.
// ────────────────────────────────────────────────────────────

import { AccountSnapshot, CompetitorSignal } from "./data-provider";

export type BriefAction = {
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
};

export type Brief = {
  greeting: string;
  headline: string;
  wins: string[];
  watch: string[];
  actions: BriefAction[];
  source: "ai" | "rules";
};

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Deterministic fallback (no API key needed) ──────────────
function ruleBasedBrief(a: AccountSnapshot, comps: CompetitorSignal[]): Brief {
  const wins: string[] = [];
  const watch: string[] = [];
  const actions: BriefAction[] = [];

  if (a.reachChangePct > 0) wins.push(`Reach is up ${a.reachChangePct}% — momentum is on your side.`);
  wins.push(`Your top ${a.topPost.format} pulled ${a.topPost.reach.toLocaleString()} reach and ${a.topPost.saves.toLocaleString()} saves.`);

  if (a.followersChange < 0) watch.push(`You lost ${Math.abs(a.followersChange)} followers yesterday — worth watching, not panicking.`);
  if (a.responseRatePct < 70) watch.push(`Response rate is ${a.responseRatePct}% — replies are slipping.`);

  if (a.pendingDMs > 0)
    actions.push({
      priority: "high",
      title: `Reply to ${a.pendingDMs} waiting DMs`,
      detail: `Your response rate dropped to ${a.responseRatePct}%. Clearing these first thing protects reach and leads.`,
    });

  actions.push({
    priority: "high",
    title: `Post a ${a.topPost.format} today at ${a.bestTimeToPost}`,
    detail: `Your audience currently prefers ${a.audiencePrefers}. Lead with a strong hook in the first 2 seconds.`,
  });

  if (comps[0])
    actions.push({
      priority: "medium",
      title: `Borrow ${comps[0].handle}'s winning angle`,
      detail: `Their post "${comps[0].standoutPost}" is working publicly. ${comps[0].note}`,
    });

  actions.push({
    priority: "medium",
    title: "Repurpose your worst post's topic as a Reel",
    detail: `"${a.worstPost.caption}" flopped as an ${a.worstPost.format} (${a.worstPost.reach.toLocaleString()} reach). The topic's fine — the format wasn't.`,
  });

  return {
    greeting: `${timeGreeting()}, ${a.displayName}`,
    headline:
      a.reachChangePct > 0
        ? `Reach up ${a.reachChangePct}%, but ${a.pendingDMs} DMs need you and followers dipped. Here's the plan.`
        : `A few things need your attention today. Here's the plan.`,
    wins,
    watch,
    actions,
    source: "rules",
  };
}

// ── Gemini-powered brief (free tier) ────────────────────────
async function aiBrief(a: AccountSnapshot, comps: CompetitorSignal[]): Promise<Brief | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `You are Dawn, an AI Instagram manager. Given this account data, write a concise, punchy daily briefing as JSON only (no markdown, no backticks).

Account: ${JSON.stringify(a)}
Competitors (public signals): ${JSON.stringify(comps)}

Return exactly this JSON shape:
{"greeting":"...","headline":"one sharp sentence","wins":["..."],"watch":["..."],"actions":[{"priority":"high|medium|low","title":"imperative action","detail":"why + how, 1-2 sentences"}]}

Rules: 3-5 actions, ordered by priority. Be specific and decisive — tell them exactly what to do, never "consider maybe". Reference their real numbers.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { ...parsed, source: "ai" as const };
  } catch {
    return null;
  }
}

export async function generateBrief(a: AccountSnapshot, comps: CompetitorSignal[]): Promise<Brief> {
  const ai = await aiBrief(a, comps);
  return ai ?? ruleBasedBrief(a, comps);
}
