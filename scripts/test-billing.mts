// V56 billing rules. The subscription state machine gates every feature in
// the product, and until now its boundaries were never tested — the
// long-carried "trial flow untested" closes here. Semantics are frozen from
// V55; these rules pin them, including the two documented quirks, so any
// future change to billing behavior must be a deliberate edit to this file.
import { computeEffective, areasFor } from "../lib/entitlements.ts";

const t: [string, any, string][] = [];
const DAY = 86400000;
const NOW = Date.parse("2026-07-23T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const eff = (sub: any, grace = 3) => computeEffective(sub, grace, 14, NOW).effective;
const days = (sub: any, grace = 3) => computeEffective(sub, grace, 14, NOW).daysLeft;

// ---- trialing: the 14 days, the boundary, the grace, the wall ----
t.push(["mid-trial is trialing", eff({ status: "trialing", trial_ends_at: iso(NOW + 5 * DAY) }), "trialing"]);
t.push(["mid-trial daysLeft counts down correctly", String(days({ status: "trialing", trial_ends_at: iso(NOW + 5 * DAY) })), "5"]);
t.push(["the last moment of the trial still counts", eff({ status: "trialing", trial_ends_at: iso(NOW) }), "trialing"]);
t.push(["one day past trial → grace", eff({ status: "trialing", trial_ends_at: iso(NOW - 1 * DAY) }), "grace"]);
t.push(["grace daysLeft = what remains of the grace window", String(days({ status: "trialing", trial_ends_at: iso(NOW - 1 * DAY) })), "2"]);
t.push(["past trial + grace → expired", eff({ status: "trialing", trial_ends_at: iso(NOW - 4 * DAY) }), "expired"]);
t.push(["zero grace: expiry is immediate", eff({ status: "trialing", trial_ends_at: iso(NOW - 1) }, 0), "expired"]);
t.push(["trialing with no end date reads as a fresh trial", eff({ status: "trialing", trial_ends_at: null }), "trialing"]);

// ---- active: the period, the boundary, the grace, the wall ----
t.push(["active inside the period", eff({ status: "active", period_end: iso(NOW + 10 * DAY) }), "active"]);
t.push(["the last moment of the period still counts", eff({ status: "active", period_end: iso(NOW) }), "active"]);
t.push(["lapsed period within grace → grace", eff({ status: "active", period_end: iso(NOW - 2 * DAY) }), "grace"]);
t.push(["…with the remaining grace days reported", String(days({ status: "active", period_end: iso(NOW - 2 * DAY) })), "1"]);
t.push(["lapsed past grace → expired", eff({ status: "active", period_end: iso(NOW - 5 * DAY) }), "expired"]);
// Documented quirk #1 (frozen until V58): no period_end on an active row
// computes as expired — both branches require the date.
t.push(["QUIRK: active with no period_end is expired", eff({ status: "active", period_end: null }), "expired"]);

// ---- cancelled: access until the period ends, then the same wall ----
t.push(["cancelled keeps access until period end", eff({ status: "cancelled", period_end: iso(NOW + 6 * DAY) }), "active"]);
t.push(["cancelled past period + grace → expired", eff({ status: "cancelled", period_end: iso(NOW - 5 * DAY) }), "expired"]);

// ---- the rest of the matrix ----
t.push(["past_due is expired (no silent access)", eff({ status: "past_due", period_end: iso(NOW + 5 * DAY) }), "expired"]);
t.push(["complimentary is always on, dates ignored", eff({ status: "complimentary", period_end: iso(NOW - 90 * DAY) }), "complimentary"]);
// Documented quirk #2 (frozen until V58): unknown status falls through open.
t.push(["QUIRK: unknown status falls through as active", eff({ status: "paused" }), "active"]);
t.push(["a null subscription computes as none", String(computeEffective(null, 3, 14, NOW).effective), "none"]);

// ---- areas: trials taste everything; legacy plans are grandfathered ----
t.push(["trialing gets both areas regardless of plan", JSON.stringify(areasFor("trialing", { crm: false })), JSON.stringify({ crm: true, instagram_ai: true })]);
t.push(["complimentary gets both areas", JSON.stringify(areasFor("complimentary", null)), JSON.stringify({ crm: true, instagram_ai: true })]);
t.push(["a modern plan's flags are respected", JSON.stringify(areasFor("active", { crm: true, instagram_ai: false })), JSON.stringify({ crm: true, instagram_ai: false })]);
t.push(["explicit crm:false is honored", String(areasFor("active", { crm: false, instagram_ai: true }).crm), "false"]);
t.push(["legacy plan with no crm key keeps CRM (grandfathered)", String(areasFor("active", { ai: true }).crm), "true"]);
t.push(["legacy ai flag maps to instagram_ai", String(areasFor("active", { ai: true }).instagram_ai), "true"]);
t.push(["no plan row at all: CRM open, AI closed", JSON.stringify(areasFor("expired", null)), JSON.stringify({ crm: true, instagram_ai: false })]);

// ---- harness ----
let bad = 0;
for (const [name, got, want] of t) {
  const g = String(got);
  if (g === want) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${g}, wanted ${want}`); bad++; }
}
if (bad) { console.log(`\x1b[31m*** ${bad} BILLING RULE FAILURE(S) ***\x1b[0m`); process.exit(1); }
console.log(`\x1b[32m*** ALL ${t.length} BILLING RULES CORRECT ***\x1b[0m`);
