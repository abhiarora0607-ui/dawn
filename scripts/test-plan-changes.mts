// V58 plan-change rules. The classification decides when money moves and
// when access changes — the exact matrix the mandate asked for, pinned:
// paying more applies now; anything else waits for renewal with an undo;
// anyone outside a paid running period is simply subscribing.
import { classifyChange, scheduleDue, priceFor } from "../lib/billing-lifecycle.ts";
import { computeEffective } from "../lib/entitlements.ts";

const t: [string, any, string][] = [];
const NOW = Date.parse("2026-07-24T10:00:00.000Z");
const D = 86400000;
const iso = (ms: number) => new Date(ms).toISOString();

// ---- classification: who pays now, who waits ----
t.push(["trial picking any plan subscribes immediately", classifyChange("trialing", null, 999), "immediate"]);
t.push(["grace picking a plan re-subscribes immediately", classifyChange("grace", 999, 499), "immediate"]);
t.push(["expired picking a plan re-subscribes immediately", classifyChange("expired", 999, 499), "immediate"]);
t.push(["complimentary choosing to pay starts now", classifyChange("complimentary", null, 999), "immediate"]);
t.push(["active paying MORE upgrades now", classifyChange("active", 999, 1999), "immediate"]);
t.push(["active paying LESS waits for renewal", classifyChange("active", 1999, 999), "scheduled"]);
t.push(["active equal price (cycle switch) waits for renewal", classifyChange("active", 999, 999), "scheduled"]);
t.push(["active with no locked price: any paid plan is an upgrade", classifyChange("active", null, 499), "immediate"]);
// Cancelled is a STORED status, never an effective one — computeEffective
// maps it to active (inside the period) or expired (past it). Pin the REAL
// pipeline: computeEffective ∘ classifyChange.
const cancelledInPeriod = computeEffective({ status: "cancelled", period_end: iso(NOW + 9 * D) }, 3, 14, NOW).effective;
t.push(["cancelled-in-period computes as active…", cancelledInPeriod, "active"]);
t.push(["…so its downgrade schedules (route clears the cancel)", classifyChange(cancelledInPeriod, 1999, 999), "scheduled"]);
t.push(["…and paying more still upgrades now", classifyChange(cancelledInPeriod, 999, 1999), "immediate"]);
const cancelledLapsed = computeEffective({ status: "cancelled", period_end: iso(NOW - 9 * D) }, 3, 14, NOW).effective;
t.push(["cancelled past its period is expired → any plan is a fresh subscribe", classifyChange(cancelledLapsed, 1999, 499), "immediate"]);

// ---- schedule application: due, blocked, boundaries ----
t.push(["a schedule past its date is due", String(scheduleDue({ scheduled_plan_id: "p", effective_at: iso(NOW - D) }, NOW)), "true"]);
t.push(["exactly at the boundary counts as due", String(scheduleDue({ scheduled_plan_id: "p", effective_at: iso(NOW) }, NOW)), "true"]);
t.push(["a future schedule is not due", String(scheduleDue({ scheduled_plan_id: "p", effective_at: iso(NOW + D) }, NOW)), "false"]);
t.push(["cancel-at-period-end blocks application", String(scheduleDue({ scheduled_plan_id: "p", effective_at: iso(NOW - D), cancel_at_period_end: true }, NOW)), "false"]);
t.push(["no scheduled plan → nothing to apply", String(scheduleDue({ effective_at: iso(NOW - D) }, NOW)), "false"]);
t.push(["a schedule with no date never fires", String(scheduleDue({ scheduled_plan_id: "p" }, NOW)), "false"]);

// ---- price picking, defensively ----
t.push(["monthly price picked for monthly", String(priceFor({ price_monthly: 999, price_yearly: 9990 }, "monthly")), "999"]);
t.push(["yearly price picked for yearly", String(priceFor({ price_monthly: 999, price_yearly: 9990 }, "yearly")), "9990"]);
t.push(["a missing plan prices at zero", String(priceFor(null, "monthly")), "0"]);
t.push(["garbage price coerces to zero", String(priceFor({ price_monthly: "abc" } as any, "monthly")), "0"]);

// ---- harness ----
let bad = 0;
for (const [name, got, want] of t) {
  const g = String(got);
  if (g === want) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${g}, wanted ${want}`); bad++; }
}
if (bad) { console.log(`\x1b[31m*** ${bad} PLAN-CHANGE RULE FAILURE(S) ***\x1b[0m`); process.exit(1); }
console.log(`\x1b[32m*** ALL ${t.length} PLAN-CHANGE RULES CORRECT ***\x1b[0m`);
