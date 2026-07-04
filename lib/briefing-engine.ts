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
// Model list is ordered by preference. If Google deprecates one,
// the next is tried automatically so the AI path can't silently
// fall back to rules over a single retired model name.
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"];

async function aiBrief(a: AccountSnapshot, comps: CompetitorSignal[], voicePrompt = ""): Promise<Brief | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = `You are Dawn — an elite Instagram growth strategist who has scaled hundreds of creator and brand accounts. You think like a mix of a data analyst and a viral content strategist. You are briefing this specific account owner first thing in the morning. Your job: cut through the noise and tell them the 3-5 highest-leverage things to do today, backed by their real numbers.

ACCOUNT DATA: ${JSON.stringify(a)}
COMPETITOR PUBLIC SIGNALS: ${JSON.stringify(comps)}

Respond with JSON only — no markdown, no backticks, no preamble:
{"greeting":"warm, personal, uses their name/brand","headline":"ONE sharp sentence that names the single most important thing happening right now, referencing a real number","wins":["1-2 specific wins, each citing a real metric"],"watch":["1-2 things to watch, framed calmly, not alarmingly"],"actions":[{"priority":"high|medium|low","title":"a specific imperative action (verb first)","detail":"WHY it matters + HOW to do it, referencing their actual data. 1-2 sentences."}]}

STRATEGIST RULES:
- Every claim must reference a REAL number from the data. Never say "engagement is good" — say "your 4.7% engagement beats the 1-3% norm."
- Prioritize by impact: what will move followers/reach/revenue most today goes first.
- Be decisive. Never "consider" or "you might" — say "post X at Y time" with conviction.
- Connect the dots between metrics: if reach is up but followers dipped, diagnose WHY and prescribe a fix.
- Actions must be doable TODAY, not vague strategy. "Reply to your 11 DMs before noon" not "improve engagement."
- Sound like a sharp human advisor who genuinely wants them to win — warm but direct, zero fluff.${voicePrompt}`;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!res.ok) continue; // try next model (e.g. 404 on a retired name)
      const data = await res.json();
      const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (parsed && Array.isArray(parsed.actions)) {
        return { ...parsed, source: "ai" as const };
      }
    } catch {
      continue; // try next model
    }
  }
  return null;
}

export async function generateBrief(a: AccountSnapshot, comps: CompetitorSignal[], voicePrompt = ""): Promise<Brief> {
  const ai = await aiBrief(a, comps, voicePrompt);
  return ai ?? ruleBasedBrief(a, comps);
}
