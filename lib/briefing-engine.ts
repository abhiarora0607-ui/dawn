// lib/briefing-engine.ts
// ────────────────────────────────────────────────────────────
// Turns account data + competitor signals into the "Good Morning"
// action plan. Uses Google Gemini (free tier) when GEMINI_API_KEY
// is set; otherwise falls back to a deterministic rule-based brief
// so the demo ALWAYS works — even at zero cost with no key.
// ────────────────────────────────────────────────────────────

import { AccountSnapshot, CompetitorSignal } from "./data-provider";
import { parseAiJson, aiText, aiTextList } from "./ai-prompt";

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

  const prompt = `You are Dawn — a revenue-focused Instagram strategist for a direct-to-consumer e-commerce brand. You think like a growth marketer who owns a store's P&L, not a content creator. The brand owner opens this briefing on their phone at 7am. Give them a ranked, revenue-aware plan: what moved the numbers that matter to a STORE (profile visits, website/link clicks, saves as purchase-intent), which content drove intent, and exactly what to do today to sell more.

ACCOUNT DATA: ${JSON.stringify(a)}
COMPETITOR PUBLIC SIGNALS: ${JSON.stringify(comps)}

Respond with JSON only — no markdown, no backticks:
{"greeting":"warm, personal, uses their brand name","headline":"ONE sharp sentence naming the most revenue-relevant thing happening, with a real number","wins":["1-2 wins framed around revenue signals — clicks, saves, profile visits, a product post that performed"],"watch":["1-2 things to watch, calm not alarming"],"actions":[{"priority":"high|medium|low","title":"a specific imperative action (verb first), tied to selling a product","detail":"WHY it matters for revenue + HOW to do it, grounded in THIS account's data. 1-2 sentences."}]}

D2C GROWTH-MARKETER RULES:
- Lead with revenue-adjacent metrics: website clicks and profile visits (traffic to store) and saves (purchase intent) matter more than raw likes. If ${a.websiteClicks || 0} website clicks or ${a.totalSaves || 0} saves are notable, say so.
- Tie content recommendations to their actual PRODUCTS and PROMOS (from store context). "Post a Reel" is worthless; "Post a Reel demoing [product] with a link sticker" is worth paying for.
- Prioritize high-intent actions: if there are buying-signal DMs/comments ("how much?", "link?"), replying to those is the #1 revenue action.
- Every action carries a one-line "why" grounded in this account's own numbers.
- Recommend the exact format + hook + angle based on what has worked for THIS brand before.
- Be decisive and specific. Never generic. A store owner comparing this to a ₹4000 freelancer must feel this is sharper.${voicePrompt}`;

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
      const parsed = parseAiJson<any>(text, null);
      if (parsed && Array.isArray(parsed.actions)) {
        // The model is asked for strings in wins/watch and {title,detail} in
        // actions, but it doesn't always comply — sometimes a win comes back as
        // {description:"..."}. Rendering that object directly is React error #31
        // ("objects are not valid as a child"), which white-screened the whole
        // dashboard. Normalise here, at the source, so every consumer gets the
        // shape the type promises.
        return { ...normalizeBrief(parsed), source: "ai" as const };
      }
    } catch {
      continue; // try next model
    }
  }
  return null;
}

/** Coerce a possibly-malformed AI brief into the Brief shape it claims to be. */
function normalizeBrief(p: any): Omit<Brief, "source"> {
  const actions: BriefAction[] = (Array.isArray(p.actions) ? p.actions : []).map((a: any) => {
    // An action might itself be a bare string, or an object missing fields.
    if (typeof a === "string") return { priority: "medium" as const, title: a, detail: "" };
    const pr = String(a?.priority || "medium").toLowerCase();
    return {
      priority: (pr === "high" || pr === "low" ? pr : "medium") as BriefAction["priority"],
      title: aiText(a?.title ?? a?.description ?? a),
      detail: aiText(a?.detail ?? a?.subtitle ?? ""),
    };
  }).filter((a: BriefAction) => a.title);

  return {
    greeting: aiText(p.greeting),
    headline: aiText(p.headline),
    wins: aiTextList(p.wins),
    watch: aiTextList(p.watch),
    actions,
  };
}

export async function generateBrief(a: AccountSnapshot, comps: CompetitorSignal[], voicePrompt = ""): Promise<Brief> {
  const ai = await aiBrief(a, comps, voicePrompt);
  return ai ?? ruleBasedBrief(a, comps);
}
