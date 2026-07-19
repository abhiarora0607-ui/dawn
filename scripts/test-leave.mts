// Leave rule tests. Run with:
//   node --experimental-strip-types scripts/test-leave.mts
//
// The year-end and pro-rata rules decide how many days someone actually has,
// so they get asserted rather than reasoned about once and forgotten.
import * as L from "../lib/leave.ts";

const t: [string, any, string][] = [];
const T = (code: string, over: any = {}): any => ({
  code, accrual: "monthly", amount: 2.5, enabled: true,
  carries_forward: false, encashable: false, sort_order: 1, ...over,
});

// ---- available ----
t.push(["available = accrued + carried - used", String(L.availableOf({ accrued: 5, carried_in: 3, used: 2 })), "6"]);
t.push(["encashed days are gone", String(L.availableOf({ accrued: 5, encashed: 2 })), "3"]);
t.push(["never negative", String(L.availableOf({ accrued: 1, used: 5 })), "0"]);
t.push(["unpaid is infinite", String(L.availableOf({}, true)), "Infinity"]);

// ---- labels ----
t.push(["exhausted reads Not Available", L.balanceLabel(0, false), "Not Available"]);
t.push(["one day is singular", L.balanceLabel(1, false), "1 day available"]);
t.push(["half days show", L.balanceLabel(2.5, false), "2.5 days available"]);
t.push(["unpaid label", L.balanceLabel(0, true), "infinite balance"]);

// ---- day counting (Sunday off) ----
const wk = { weeklyOffs: [0], holidays: {} as Record<string, string> };
// 2026-07-17 Fri → 2026-07-20 Mon, Sunday 19th is off
t.push(["Fri–Mon over a Sunday = 3 days", String(L.leaveDaysBetween("2026-07-17", "2026-07-20", wk).days), "3"]);
t.push(["single day = 1", String(L.leaveDaysBetween("2026-07-17", "2026-07-17", wk).days), "1"]);
t.push(["half day = 0.5", String(L.leaveDaysBetween("2026-07-17", "2026-07-17", { ...wk, halfDay: true }).days), "0.5"]);
t.push(["holiday inside range is free", String(L.leaveDaysBetween("2026-07-15", "2026-07-17", { weeklyOffs: [], holidays: { "2026-07-16": "Festival" } }).days), "2"]);

// ---- pro-rata accrual ----
t.push(["full month = full amount", String(L.accrualForMonth(T("earned"), "2026-07", "2020-01-01")), "2.5"]);
// joined 20 Jul in a 31-day month → 12/31 of 2.5 = 0.967 → 1.0
t.push(["joined 20th of 31 = 1", String(L.accrualForMonth(T("earned"), "2026-07", "2026-07-20")), "1"]);
// joined 1st = full
t.push(["joined 1st = full", String(L.accrualForMonth(T("earned"), "2026-07", "2026-07-01")), "2.5"]);
t.push(["joins next month = 0", String(L.accrualForMonth(T("earned"), "2026-07", "2026-08-05")), "0"]);
t.push(["disabled type = 0", String(L.accrualForMonth(T("earned", { enabled: false }), "2026-07", null)), "0"]);
t.push(["yearly type accrues 0 monthly", String(L.accrualForMonth(T("bereavement", { accrual: "yearly", amount: 3 }), "2026-07", null)), "0"]);

// ---- year end: carry 12, encash 5 ----
const bals = [
  { code: "earned", available: 20, carries_forward: true, encashable: true },
  { code: "casual", available: 4, carries_forward: false, encashable: false },
];
const ye = L.yearEndFor(bals, 12, 5);
t.push(["earned carries up to cap", String(ye.earned.carry), "12"]);
t.push(["then encashes up to its cap", String(ye.earned.encash), "5"]);
t.push(["remainder lapses", String(ye.earned.lapse), "3"]);
t.push(["non-carrying type carries 0", String(ye.casual.carry), "0"]);
t.push(["non-encashable lapses fully", String(ye.casual.lapse), "4"]);

// small balance: carries all, nothing to encash or lapse
const ye2 = L.yearEndFor([{ code: "earned", available: 3, carries_forward: true, encashable: true }], 12, 5);
t.push(["small balance carries whole", String(ye2.earned.carry), "3"]);
t.push(["nothing left to encash", String(ye2.earned.encash), "0"]);
t.push(["nothing lapses", String(ye2.earned.lapse), "0"]);

// ---- birthday restriction ----
t.push(["birthday on the day", String(L.typeBookable("birthday", "2026-07-19", { date_of_birth: "1995-07-19" }).ok), "true"]);
t.push(["birthday other day blocked", String(L.typeBookable("birthday", "2026-07-18", { date_of_birth: "1995-07-19" }).ok), "false"]);
t.push(["no DOB blocks birthday", String(L.typeBookable("birthday", "2026-07-19", {}).ok), "false"]);
t.push(["other types unrestricted", String(L.typeBookable("casual", "2026-07-18", {}).ok), "true"]);

// ---- day rate ----
t.push(["day rate = salary/30", String(L.dayRate(18000)), "600"]);

// ---- leave on date ----
const reqs = [{ status: "approved", code: "casual", from_date: "2026-07-15", to_date: "2026-07-17" }];
t.push(["date inside approved leave", String(L.leaveOnDate(reqs, "2026-07-16")), "casual"]);
t.push(["date outside", String(L.leaveOnDate(reqs, "2026-07-20")), "null"]);
t.push(["pending doesn't count", String(L.leaveOnDate([{ ...reqs[0], status: "pending" }], "2026-07-16")), "null"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} LEAVE RULES CORRECT ***` : `\n*** ${bad} RULE FAILURE(S) ***`);
