// V49 bonus kinds. The one rule that must never break: leave_gift is NOT cash
// and must never become a payslip line — it grants leave. Everything else is
// cash and rides payroll.
import * as B from "../lib/bonus.ts";

const t: [string, any, string][] = [];

// ---- classification ----
t.push(["cash is cash", String(B.isCashBonus("cash")), "true"]);
t.push(["gift is cash", String(B.isCashBonus("gift")), "true"]);
t.push(["performance is cash", String(B.isCashBonus("performance")), "true"]);
t.push(["leave_gift is NOT cash", String(B.isCashBonus("leave_gift")), "false"]);
t.push(["unknown kind is not cash", String(B.isCashBonus("bogus")), "false"]);

// ---- the cash set excludes leave_gift ----
t.push(["cash set has three", String(B.CASH_BONUS_KINDS.length), "3"]);
t.push(["cash set excludes leave_gift", String(B.CASH_BONUS_KINDS.includes("leave_gift" as any)), "false"]);

// ---- validity ----
t.push(["cash is a valid kind", String(B.isBonusKind("cash")), "true"]);
t.push(["leave_gift is a valid kind", String(B.isBonusKind("leave_gift")), "true"]);
t.push(["garbage is not a kind", String(B.isBonusKind("xyz")), "false"]);

// ---- units: leave_gift is days, others money ----
t.push(["leave_gift unit is days", String(B.bonusKindDef("leave_gift")?.unit), "days"]);
t.push(["gift unit is money", String(B.bonusKindDef("gift")?.unit), "money"]);

// ---- line labels ----
t.push(["gift label with reason", B.bonusLineLabel("gift", "Diwali"), "Gift / festival — Diwali"]);
t.push(["performance label bare", B.bonusLineLabel("performance", ""), "Performance bonus"]);
t.push(["cash label with reason", B.bonusLineLabel("cash", "Great quarter"), "Cash bonus — Great quarter"]);
t.push(["unknown kind falls back to Bonus", B.bonusLineLabel("weird", "x"), "Bonus — x"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} BONUS RULES CORRECT ***` : `\n*** ${bad} BONUS FAILURE(S) ***`);
