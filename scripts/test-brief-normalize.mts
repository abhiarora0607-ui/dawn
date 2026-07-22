// V50.1 — the React #31 crash. AI responses must be coerced to their declared
// shape before they reach any render, because the model doesn't always return
// strings where the type says string. These test the SHARED helpers every
// feature now uses.
import { aiText, aiTextList } from "../lib/ai-prompt.ts";
const t: [string, any, string][] = [];
const toText = aiText;

// The shared helpers are imported above; these tests lock their contract.

// ---- the exact crash: a win returned as an object ----
t.push(["win as {description} → its text", toText({ description: "Saves up 20%" }), "Saves up 20%"]);
t.push(["win as {text} → its text", toText({ text: "Reach grew" }), "Reach grew"]);
t.push(["plain string win passes through", toText("Clicks doubled"), "Clicks doubled"]);
t.push(["null → empty, not crash", toText(null), ""]);
t.push(["number → string", toText(42), "42"]);
t.push(["object with only a stray string field", toText({ foo: "bar" }), "bar"]);
t.push(["nested object → empty not [object Object]", String(toText({ a: { b: 1 } }) !== "[object Object]"), "true"]);

// ---- integration: replicate the full normalizeBrief and prove it cleans a
// worst-case AI response into all-strings ----
const toStrList = aiTextList;
function normalizeBrief(p: any) {
  const actions = (Array.isArray(p.actions) ? p.actions : []).map((a: any) => {
    if (typeof a === "string") return { priority: "medium", title: a, detail: "" };
    const pr = String(a?.priority || "medium").toLowerCase();
    return {
      priority: (pr === "high" || pr === "low" ? pr : "medium"),
      title: toText(a?.title ?? a?.description ?? a),
      detail: toText(a?.detail ?? a?.subtitle ?? ""),
    };
  }).filter((a: any) => a.title);
  return { greeting: toText(p.greeting), headline: toText(p.headline), wins: toStrList(p.wins), watch: toStrList(p.watch), actions };
}

// The worst case that actually crashed: wins as objects, an action as a string,
// an action missing detail, a null in watch.
const malformed = {
  greeting: { text: "Morning, Store" },
  headline: "Reach up 12%",
  wins: [{ description: "Saves up 20%" }, "Clicks doubled", null],
  watch: [{ text: "DMs piling up" }, undefined],
  actions: ["Reply to DMs now", { title: "Post a reel", priority: "HIGH" }, { description: "Restock bottles" }],
};
const n = normalizeBrief(malformed);
t.push(["greeting object coerced", n.greeting, "Morning, Store"]);
t.push(["wins all strings", String(n.wins.every((w: any) => typeof w === "string")), "true"]);
t.push(["wins dropped the null", String(n.wins.length), "2"]);
t.push(["watch object coerced", n.watch[0], "DMs piling up"]);
t.push(["string action got a title", n.actions[0].title, "Reply to DMs now"]);
t.push(["HIGH priority normalised to high", n.actions[1].priority, "high"]);
t.push(["action-as-{description} got title", n.actions[2].title, "Restock bottles"]);
t.push(["every action title is a string", String(n.actions.every((a: any) => typeof a.title === "string" && typeof a.detail === "string")), "true"]);

// ---- content-expand shapes: shotPlan steps and proTips as objects ----
t.push(["shotPlan step {step} coerced", aiText({ step: "Film the pour in slow-mo" }), "Film the pour in slow-mo"]);
t.push(["proTip {tip} coerced", aiText({ tip: "Post at 7am for reach" }), "Post at 7am for reach"]);
t.push(["shotPlan list mixed objects+strings", JSON.stringify(aiTextList([{ step: "A" }, "B", { text: "C" }, null])), '["A","B","C"]']);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} BRIEF-NORMALIZE RULES CORRECT ***` : `\n*** ${bad} BRIEF-NORMALIZE FAILURE(S) ***`);
