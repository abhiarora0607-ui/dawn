// Commission and payroll-timing rules. These decide what lands in someone's
// bank account, so every case is asserted rather than reasoned about once.
import * as C from "../lib/commission.ts";
import { buildPayslip } from "../lib/payroll.ts";

const t: [string, any, string][] = [];

// owner → alice → {carol, dan}, owner → bob
const TREE: Record<string, string[]> = {
  owner: ["alice", "bob", "carol", "dan"],
  alice: ["carol", "dan"],
  bob: [], carol: [], dan: [],
};
const sub = (id: string) => TREE[id] || [];

const ORDERS: any[] = [
  { employeeId: "alice", amountPaid: 10000, status: "Delivered" },
  { employeeId: "carol", amountPaid: 20000, status: "Delivered" },
  { employeeId: "dan", amountPaid: 5000, status: "Delivered" },
  { employeeId: "bob", amountPaid: 8000, status: "Delivered" },
  { employeeId: "carol", amountPaid: 99000, status: "Cancelled" },   // must never count
  { employeeId: null, amountPaid: 4000, status: "Delivered" },       // unattributed
  { employeeId: "dan", amountPaid: 0, status: "Delivered" },         // invoiced, unpaid
];
const REV = C.revenueByEmployee(ORDERS);

// ---- what counts as revenue ----
t.push(["cancelled orders excluded", String(REV.carol), "20000"]);
t.push(["unpaid orders contribute nothing", String(REV.dan), "5000"]);
t.push(["unattributed revenue pays nobody", String(REV["null"] === undefined), "true"]);
t.push(["countable filters zero and cancelled", C.countableOrders(ORDERS).length + "", "5"]);

// ---- own vs team basis ----
const ownCfg: any = { employeeId: "alice", eligible: true, basis: "own", rate: 10 };
t.push(["own basis uses only their revenue", String(C.basisRevenue(ownCfg, REV, sub)), "10000"]);
t.push(["own basis pays 10%", String(C.commissionFor(ownCfg, REV, sub).amount), "1000"]);

const teamCfg: any = { employeeId: "alice", eligible: true, basis: "team", rate: 10 };
// alice 10000 + carol 20000 + dan 5000 = 35000
t.push(["team basis includes the subtree", String(C.basisRevenue(teamCfg, REV, sub)), "35000"]);
t.push(["team basis includes themselves", String(C.basisRevenue(teamCfg, REV, sub) > (REV.carol + REV.dan)), "true"]);
t.push(["team basis pays on the total", String(C.commissionFor(teamCfg, REV, sub).amount), "3500"]);

// a member on team basis who manages nobody = same as own
const loneTeam: any = { employeeId: "bob", eligible: true, basis: "team", rate: 10 };
t.push(["team basis with no reports equals own", String(C.basisRevenue(loneTeam, REV, sub)), "8000"]);

// ---- eligibility ----
t.push(["ineligible pays nothing", String(C.commissionFor({ ...ownCfg, eligible: false }, REV, sub).amount), "0"]);
t.push(["zero rate pays nothing", String(C.commissionFor({ ...ownCfg, rate: 0 }, REV, sub).amount), "0"]);
t.push(["ineligible reports zero base", String(C.commissionFor({ ...ownCfg, eligible: false }, REV, sub).base), "0"]);
t.push(["no revenue pays nothing", String(C.commissionFor({ employeeId: "nobody", eligible: true, basis: "own", rate: 10 } as any, REV, sub).amount), "0"]);

// ---- fractional rates ----
t.push(["2.5% of 10000", String(C.commissionFor({ ...ownCfg, rate: 2.5 }, REV, sub).amount), "250"]);
t.push(["0.5% rounds to paise", String(C.commissionFor({ ...ownCfg, rate: 0.5 }, REV, sub).amount), "50"]);

// ---- label is checkable ----
const lbl = C.commissionLabel({ base: 35000, rate: 10 }, "team");
t.push(["label names the rate", String(lbl.includes("10%")), "true"]);
t.push(["label names the base", String(lbl.includes("35,000")), "true"]);
t.push(["label says team", String(lbl.includes("team revenue")), "true"]);

// ---- the overlap warning ----
const overlapping: any[] = [
  { employeeId: "alice", eligible: true, basis: "team", rate: 5 },
  { employeeId: "carol", eligible: true, basis: "own", rate: 10 },
];
const pv = C.previewCost(overlapping, REV, sub);
t.push(["overlap detected", String(pv.hasOverlap), "true"]);
// alice 5% of 35000 = 1750, carol 10% of 20000 = 2000
t.push(["overlap total is the sum", String(pv.totalCommission), "3750"]);
t.push(["preview totals revenue", String(pv.totalRevenue), "43000"]);
t.push(["effective rate computed", String(pv.effectiveRate > 8 && pv.effectiveRate < 9), "true"]);

const noOverlap: any[] = [{ employeeId: "bob", eligible: true, basis: "own", rate: 5 }];
t.push(["no overlap when nobody nests", String(C.previewCost(noOverlap, REV, sub).hasOverlap), "false"]);
const teamButNoEligibleBelow: any[] = [{ employeeId: "alice", eligible: true, basis: "team", rate: 5 }];
t.push(["team basis alone isn't overlap", String(C.previewCost(teamButNoEligibleBelow, REV, sub).hasOverlap), "false"]);
t.push(["zero revenue gives zero rate", String(C.previewCost(noOverlap, {}, sub).effectiveRate), "0"]);

// ---- month completion guard ----
t.push(["last month is draftable", String(C.monthIsComplete("2026-06", "2026-07-15")), "true"]);
t.push(["current month is not", String(C.monthIsComplete("2026-07", "2026-07-15")), "false"]);
t.push(["current month refused on the 1st", String(C.monthIsComplete("2026-07", "2026-07-01")), "false"]);
t.push(["future month is not", String(C.monthIsComplete("2026-09", "2026-07-15")), "false"]);
t.push(["december draftable in january", String(C.monthIsComplete("2025-12", "2026-01-02")), "true"]);
t.push(["january not draftable in january", String(C.monthIsComplete("2026-01", "2026-01-31")), "false"]);
t.push(["old months stay draftable", String(C.monthIsComplete("2024-03", "2026-07-15")), "true"]);

t.push(["guard explains the wait", String(C.monthGuardError("2026-07", "2026-07-15")?.includes("hasn't finished")), "true"]);
t.push(["guard names the month", String(C.monthGuardError("2026-07", "2026-07-15")?.includes("July")), "true"]);
t.push(["guard silent when allowed", String(C.monthGuardError("2026-06", "2026-07-15")), "null"]);
t.push(["future month says so", String(C.monthGuardError("2026-12", "2026-07-15")?.includes("future")), "true"]);

t.push(["latest draftable in july is june", C.latestDraftableMonth("2026-07-15"), "2026-06"]);
t.push(["latest draftable in january is december", C.latestDraftableMonth("2026-01-10"), "2025-12"]);

// ---- unpaid leave on the payslip ----
const noLeave = buildPayslip({
  employeeName: "X", monthlySalary: 31000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07",
});
t.push(["no unpaid days = full pay", String(noLeave.totals.net), "31000"]);
// July has 31 days → 1000/day
t.push(["day rate uses this month's length", String(noLeave.dayRate), "1000"]);

const withUnpaid = buildPayslip({
  employeeName: "X", monthlySalary: 31000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07", unpaidDays: 3,
});
t.push(["three unpaid days deducted", String(withUnpaid.totals.net), "28000"]);
t.push(["deduction is its own line", String(withUnpaid.lines.some((l) => l.kind === "deduction")), "true"]);
t.push(["deduction line names the days", String(withUnpaid.lines.find((l) => l.kind === "deduction")!.label), "3 days unpaid leave"]);
t.push(["one day reads singular", String(buildPayslip({
  employeeName: "X", monthlySalary: 31000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07", unpaidDays: 1,
}).lines.find((l) => l.kind === "deduction")!.label), "1 day unpaid leave"]);

// February must not use the same day rate as July
const feb = buildPayslip({
  employeeName: "X", monthlySalary: 28000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-02", unpaidDays: 1,
});
t.push(["february day rate differs", String(feb.dayRate), "1000"]);
t.push(["half-day unpaid works", String(buildPayslip({
  employeeName: "X", monthlySalary: 31000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07", unpaidDays: 0.5,
}).totals.net), "30500"]);

// a whole month unpaid must not go negative
const allUnpaid = buildPayslip({
  employeeName: "X", monthlySalary: 31000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07", unpaidDays: 31,
});
t.push(["fully unpaid month nets zero", String(allUnpaid.totals.net), "0"]);

// ---- commission on the payslip ----
const withComm = buildPayslip({
  employeeName: "X", monthlySalary: 20000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07",
  commission: { amount: 3500, label: "Commission — 10% of ₹35,000 team revenue" },
});
t.push(["commission adds to net", String(withComm.totals.net), "23500"]);
t.push(["commission counts as an addition", String(withComm.totals.additions), "3500"]);
t.push(["zero commission adds no line", String(buildPayslip({
  employeeName: "X", monthlySalary: 20000, bonuses: [], encashments: [],
  joiningDate: "2020-01-01", month: "2026-07", commission: { amount: 0, label: "none" },
}).lines.length), "1"]);

// everything at once
const full = buildPayslip({
  employeeName: "X", monthlySalary: 31000,
  bonuses: [{ id: "b", amount: 2000, reason: "Diwali" }],
  encashments: [{ id: "e", days: 2, amount: 2000, label: "Earned Leave" }],
  joiningDate: "2020-01-01", month: "2026-07", unpaidDays: 2,
  commission: { amount: 5000, label: "Commission — 10% of ₹50,000 revenue" },
});
// 31000 + 5000 + 2000 + 2000 - 2000 = 38000
t.push(["full payslip nets correctly", String(full.totals.net), "38000"]);
t.push(["full payslip has five lines", String(full.lines.length), "5"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} COMMISSION RULES CORRECT ***` : `\n*** ${bad} COMMISSION FAILURE(S) ***`);
