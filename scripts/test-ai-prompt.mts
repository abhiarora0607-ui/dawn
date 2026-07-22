// V50 shared AI foundation. Every feature's prompt now flows through these, so
// the context renderer and the JSON parser are load-bearing across the product.
import { accountContext, parseAiJson, buildPrompt, JSON_ONLY, DAWN_IDENTITY } from "../lib/ai-prompt.ts";

const t: [string, any, string][] = [];

const acct: any = {
  handle: "greenjuice", displayName: "Green Juice Co", niche: "cold-pressed juice",
  followers: 12400, followersChange: 120, reach: 48000, reachChangePct: 15,
  engagementRate: 4.2, totalSaves: 890, websiteClicks: 210, profileVisits: 3200,
  audiencePrefers: "before/after transformation reels", bestTimeToPost: "7am IST",
  topPost: { caption: "3-day reset that actually works", format: "reel", reach: 90000, saves: 1200 },
  worstPost: { caption: "new flavour drop", format: "static", reach: 800 },
};

const ctx = accountContext(acct);
// context must surface the meaningful signals, not just name+niche
t.push(["context has followers", String(/12,400/.test(ctx)), "true"]);
t.push(["context has saves intent signal", String(/890/.test(ctx) && /intent/.test(ctx)), "true"]);
t.push(["context has what audience rewards", String(/before\/after/.test(ctx)), "true"]);
t.push(["context has top post", String(/90,000 reach/.test(ctx)), "true"]);
t.push(["context names the weak post too", String(/Weakest/.test(ctx)), "true"]);

// undefined fields are omitted, not shown as zero
const sparse: any = { handle: "x", displayName: "", niche: "fitness", followers: 100, followersChange: 0, reach: 500, reachChangePct: 0, engagementRate: 2, profileVisits: 50, audiencePrefers: "tips", bestTimeToPost: "6pm", topPost: null, worstPost: null };
const sctx = accountContext(sparse);
t.push(["absent saves omitted, not zeroed", String(!/Recent saves/.test(sctx)), "true"]);
t.push(["absent top post omitted", String(!/Best recent post/.test(sctx)), "true"]);
t.push(["zero change shows no noisy (+0)", String(!/\+0/.test(sctx)), "true"]);

// JSON parsing: fences, prose-wrapped, malformed
t.push(["parses clean json", JSON.stringify(parseAiJson('{"a":1}', {})), '{"a":1}']);
t.push(["strips ```json fences", JSON.stringify(parseAiJson('```json\n{"a":2}\n```', {})), '{"a":2}']);
t.push(["extracts json from prose", JSON.stringify(parseAiJson('Here you go: {"a":3} hope that helps', {})), '{"a":3}']);
t.push(["array response", JSON.stringify(parseAiJson('[1,2,3]', [])), "[1,2,3]"]);
t.push(["malformed → fallback", JSON.stringify(parseAiJson('not json at all', { ok: false })), '{"ok":false}']);
t.push(["empty → fallback", JSON.stringify(parseAiJson('', [])), "[]"]);

// buildPrompt assembles in the right order with identity + json rule
const p = buildPrompt({ expertise: "You engineer carousels.", context: ctx, task: "Make 3 slides." });
t.push(["prompt leads with Dawn identity", String(p.startsWith("You are Dawn")), "true"]);
t.push(["prompt includes the expertise", String(/engineer carousels/.test(p)), "true"]);
t.push(["prompt includes account context", String(/greenjuice/.test(p)), "true"]);
t.push(["prompt ends with JSON discipline", String(p.trim().endsWith(JSON_ONLY)), "true"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} AI-PROMPT RULES CORRECT ***` : `\n*** ${bad} AI-PROMPT FAILURE(S) ***`);
