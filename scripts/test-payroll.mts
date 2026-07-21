// Payroll rules. This arithmetic decides what someone is paid and what lands
// in the books, so every case is asserted rather than reasoned about once.
import * as P from "../lib/payroll.ts";

const t: [string, any, string][] = [];

// ---- totals ----
const basic: any[] = [{ kind: "base", label: "Salary", amount: 18000 }];
t.push(["base only", String(P.totalsOf(basic).net), "18000"]);

const withBonus: any[] = [
  { kind: "base", label: "Salary", amount: 18000 },
  { kind: "bonus", label: "Diwali", amount: 5000 },
];
t.push(["bonus adds", String(P.totalsOf(withBonus).net), "23000"]);
t.push(["additions tracked separately", String(P.totalsOf(withBonus).additions), "5000"]);

const withDeduction: any[] = [
  { kind: "base", label: "Salary", amount: 18000 },
  { kind: "deduction", label: "Advance", amount: 2000 },
];
t.push(["deduction subtracts", String(P.totalsOf(withDeduction).net), "16000"]);
// a deduction entered as a negative must not add
const negDeduction: any[] = [
  { kind: "base", label: "Salary", amount: 18000 },
  { kind: "deduction", label: "Advance", amount: -2000 },
];
t.push(["negative deduction still subtracts", String(P.totalsOf(negDeduction).net), "16000"]);

const everything: any[] = [
  { kind: "base", label: "Salary", amount: 18000 },
  { kind: "bonus", label: "Diwali", amount: 5000 },
  { kind: "encashment", label: "2 days", amount: 1200 },
  { kind: "deduction", label: "Advance", amount: 2000 },
];
t.push(["full slip nets correctly", String(P.totalsOf(everything).net), "22200"]);

// ---- transitions ----
t.push(["draft can be approved", String(P.canTransition("draft", "approved")), "true"]);
t.push(["draft cannot skip to paid", String(P.canTransition("draft", "paid")), "false"]);
t.push(["approved can be paid", String(P.canTransition("approved", "paid")), "true"]);
t.push(["approved can go back to draft", String(P.canTransition("approved", "draft")), "true"]);
t.push(["paid is final", String(P.canTransition("paid", "draft")), "false"]);
t.push(["paid cannot be cancelled", String(P.canTransition("paid", "cancelled")), "false"]);
t.push(["cancelled is final", String(P.canTransition("cancelled", "draft")), "false"]);
t.push(["skipping approval is explained", String(P.transitionError("draft", "paid")).includes("Approve it"), "true"]);
t.push(["paid error mentions adjustment", String(P.transitionError("paid", "draft")).includes("adjustment"), "true"]);

// ---- payslip composition ----
const full = P.buildPayslip({
  employeeName: "Priya", monthlySalary: 18000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07",
});
t.push(["full month is not pro-rata", String(full.proRata), "false"]);
t.push(["full month pays full", String(full.totals.net), "18000"]);

// joined 20 July (31 days) → 12/31 of 18000 = 6967.74
const midMonth = P.buildPayslip({
  employeeName: "New", monthlySalary: 18000, bonuses: [], encashments: [],
  joiningDate: "2026-07-20", month: "2026-07",
});
t.push(["mid-month joiner is pro-rata", String(midMonth.proRata), "true"]);
t.push(["pro-rata maths", String(midMonth.totals.base), "6967.74"]);
t.push(["pro-rata label names the date", String(midMonth.lines[0].label.includes("2026-07-20")), "true"]);

// joined the 1st = full month
const firstDay = P.buildPayslip({
  employeeName: "New", monthlySalary: 18000, bonuses: [], encashments: [],
  joiningDate: "2026-07-01", month: "2026-07",
});
t.push(["joining on the 1st is full pay", String(firstDay.proRata), "false"]);

// joined a previous month = full
const earlier = P.buildPayslip({
  employeeName: "X", monthlySalary: 18000, bonuses: [], encashments: [],
  joiningDate: "2026-05-14", month: "2026-07",
});
t.push(["earlier joiner is full pay", String(earlier.totals.net), "18000"]);

// bonuses and encashment ride the same slip
const combined = P.buildPayslip({
  employeeName: "Priya", monthlySalary: 18000,
  bonuses: [{ id: "b1", amount: 5000, reason: "Diwali" }],
  encashments: [{ id: "e1", days: 2, amount: 1200, label: "Earned Leave" }],
  joiningDate: "2020-01-01", month: "2026-07",
});
t.push(["everything on one slip", String(combined.lines.length), "3"]);
t.push(["combined net", String(combined.totals.net), "24200"]);
t.push(["bonus reason surfaces", String(combined.lines[1].label), "Bonus — Diwali"]);
t.push(["encashment reads plainly", String(combined.lines[2].label), "2 days of Earned Leave encashed"]);
t.push(["line keeps its source", String(combined.lines[1].sourceId), "b1"]);

// ---- expense note ----
t.push(["note names the month", P.expenseNoteFor("Priya", "2026-07", { base: 18000, additions: 0 }), "Salary — Priya, July 2026"]);
t.push(["note breaks out additions", String(P.expenseNoteFor("Priya", "2026-07", { base: 18000, additions: 6200 }).includes("+ ₹6,200")), "true"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} PAYROLL RULES CORRECT ***` : `\n*** ${bad} PAYROLL FAILURE(S) ***`);
