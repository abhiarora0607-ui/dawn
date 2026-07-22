// lib/ai-prompt.ts
// The shared foundation every AI feature builds its prompt on.
//
// Before V50 each route wrote its own "You are Dawn…" line, its own context
// block, and its own JSON instruction inline. The content route did this well;
// the others drifted — thinner roles, less context, no fallback. The result
// was inconsistent output quality across features that all speak as the same
// product.
//
// This module fixes that at the root. It gives one place for:
//   · Dawn's identity and operating principles (evidence over assumptions,
//     never generic, context-first) — the philosophy the reference standard
//     asks every feature to follow.
//   · A single account-context renderer, so every feature reasons from the
//     SAME rich snapshot rather than each picking a few fields.
//   · The JSON-only discipline and a parse helper with the fences-stripping
//     and fallback pattern the content route proved out.
//
// A feature's prompt then becomes: identity + its own expert framing + the
// shared context + its own task and schema. Consistent where it should be,
// specialised where it matters.

import type { AccountSnapshot, CompetitorSignal } from "./data-provider";

/**
 * Dawn's identity and the principles every feature shares. Kept short — the
 * feature adds its own specific expertise on top. This is the part that must
 * read the same across the whole product.
 */
export const DAWN_IDENTITY =
  "You are Dawn, an expert Instagram growth strategist embedded inside a founder's own toolkit. " +
  "You reason from this specific account's real numbers, never from generic playbooks. " +
  "You prefer evidence to assumption: when the data shows something, you build on it; when it's missing, you say so rather than inventing it. " +
  "You never produce filler a hundred other accounts could receive — every line is specific to this account and this niche.";

/**
 * The full account context, rendered once, the same way for every feature.
 *
 * Features used to each JSON.stringify a handful of fields. This surfaces the
 * whole meaningful picture — growth, intent proxies (saves, website clicks),
 * what's working and what isn't — so a prompt can reason about trends, not
 * just a name and a niche. Undefined fields are omitted rather than shown as
 * empty, so the model isn't told "0 saves" when we simply don't have saves.
 */
export function accountContext(a: AccountSnapshot): string {
  const lines: string[] = [];
  lines.push(`Handle: @${a.handle}${a.displayName ? ` (${a.displayName})` : ""}`);
  lines.push(`Niche: ${a.niche}`);
  lines.push(`Followers: ${a.followers.toLocaleString()}${fmtChange(a.followersChange, "vs yesterday")}`);
  lines.push(`Reach: ${a.reach.toLocaleString()}${fmtPct(a.reachChangePct, "vs previous period")}`);
  lines.push(`Engagement rate: ${a.engagementRate}%`);
  if (a.totalSaves != null) lines.push(`Recent saves: ${a.totalSaves.toLocaleString()} (a strong intent signal)`);
  if (a.websiteClicks != null) lines.push(`Link-in-bio clicks: ${a.websiteClicks.toLocaleString()} (purchase-intent proxy)`);
  lines.push(`Profile visits: ${a.profileVisits.toLocaleString()}`);
  lines.push(`Audience currently rewards: ${a.audiencePrefers}`);
  lines.push(`Best time to post: ${a.bestTimeToPost}`);
  if (a.topPost) lines.push(`Best recent post: a ${a.topPost.format} — ${a.topPost.reach.toLocaleString()} reach, ${a.topPost.saves.toLocaleString()} saves. Caption: "${trim(a.topPost.caption, 120)}"`);
  if (a.worstPost) lines.push(`Weakest recent post: a ${a.worstPost.format} — only ${a.worstPost.reach.toLocaleString()} reach. Caption: "${trim(a.worstPost.caption, 120)}"`);
  return lines.join("\n");
}

/** A compact competitor block, when a feature has competitor signal. */
export function competitorContext(comps: CompetitorSignal[]): string {
  if (!comps || comps.length === 0) return "";
  const rows = comps.slice(0, 8).map((c) =>
    `- @${c.handle}: ${c.postsLast7d} posts last 7d, leans on ${c.topFormat}` +
    (c.standoutPost ? `. Standout (${c.standoutReach?.toLocaleString?.() || "?"} reach): "${trim(c.standoutPost, 80)}"` : "")).join("\n");
  return `\n\nCOMPETITORS IN THIS NICHE:\n${rows}`;
}

/**
 * The instruction that makes output parseable. One wording, everywhere, so the
 * parser downstream can rely on it.
 */
export const JSON_ONLY =
  "Respond with valid JSON only — no markdown, no code fences, no commentary before or after.";

/**
 * Parse a model response that should be JSON. Strips fences the model adds
 * despite instructions, and returns a fallback rather than throwing, because a
 * single malformed generation must never surface as a broken screen.
 */
export function parseAiJson<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  try {
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    // Some models wrap a lone object in prose; grab the outermost JSON if so.
    const start = clean.search(/[[{]/);
    const end = Math.max(clean.lastIndexOf("]"), clean.lastIndexOf("}"));
    const slice = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
    const parsed = JSON.parse(slice);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Assemble a feature prompt from its parts, in the same order every time:
 * identity → the feature's expert framing → shared context → the feature's
 * task and output schema.
 */
export function buildPrompt(opts: {
  expertise: string;        // the feature-specific role/expertise line(s)
  context: string;          // usually accountContext(...) plus any extras
  task: string;             // what to produce, including the output schema
  voice?: string;           // optional brand-voice addendum
}): string {
  return [
    DAWN_IDENTITY,
    opts.expertise.trim(),
    `\nACCOUNT CONTEXT:\n${opts.context.trim()}`,
    opts.voice ? opts.voice.trim() : "",
    `\n${opts.task.trim()}`,
    `\n${JSON_ONLY}`,
  ].filter(Boolean).join("\n");
}

function fmtChange(n: number | undefined, suffix: string): string {
  if (n == null || n === 0) return "";
  return ` (${n > 0 ? "+" : ""}${n.toLocaleString()} ${suffix})`;
}
function fmtPct(n: number | undefined, suffix: string): string {
  if (n == null || n === 0) return "";
  return ` (${n > 0 ? "+" : ""}${n}% ${suffix})`;
}
function trim(s: string, max: number): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
