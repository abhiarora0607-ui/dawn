// lib/leave.ts
// The leave rules. Like the attendance engine, everything that decides what a
// balance *is* lives here rather than scattered across routes.
//
// Two principles shape this file:
//
//  1. THE CATALOGUE IS FIXED. Owners tune how much each type gives and whether
//     it carries forward, but they can't rename or invent types. That keeps
//     the words the same for an employee moving between businesses, and it
//     stops "Leave Type 3" ever appearing on someone's record.
//
//  2. RUNNING OUT IS NOT A REFUSAL. When a balance is exhausted, the day is
//     offered as unpaid rather than blocked. People need days off they haven't
//     earned; the business needs the day recorded. Blocking serves neither.

import { dateRange, istWeekday, istDate } from "@/lib/attendance";

export type LeaveCode =
  | "casual" | "earned" | "sick" | "bereavement" | "birthday"
  | "marriage" | "maternity" | "paternity" | "unpaid";

export const LEAVE_CODES: LeaveCode[] = [
  "casual", "earned", "sick", "bereavement", "birthday",
  "marriage", "maternity", "paternity", "unpaid",
];

export const LEAVE_LABEL: Record<string, string> = {
  casual: "Casual Leave",
  earned: "Earned Leave",
  sick: "Sick Leave",
  bereavement: "Bereavement Leave",
  birthday: "Birthday Leave",
  marriage: "Self Marriage Leave",
  maternity: "Maternity Leave",
  paternity: "Paternity Leave",
  unpaid: "Unpaid Leave",
};

/** A one-line explanation the owner sees beside each type in settings. */
export const LEAVE_HINT: Record<string, string> = {
  casual: "Short notice days off — the everyday one.",
  earned: "Builds up over the year. Usually the type that carries forward and can be encashed.",
  sick: "For illness. Most businesses don't carry this forward.",
  bereavement: "For a death in the family.",
  birthday: "One day, bookable only on their birthday. Needs a date of birth on their record.",
  marriage: "For their own wedding.",
  maternity: "Set the number of days your business offers, then switch it on.",
  paternity: "Set the number of days your business offers, then switch it on.",
  unpaid: "Always available, never runs out, never paid. Used automatically when a balance is exhausted.",
};

/** Types that can only be taken on a specific date. */
export const DATE_RESTRICTED: Record<string, "birthday" | undefined> = { birthday: "birthday" };

export type LeaveType = {
  code: LeaveCode;
  accrual: "monthly" | "yearly" | "none";
  amount: number;
  enabled: boolean;
  carries_forward: boolean;
  encashable: boolean;
  sort_order: number;
};

export type Balance = {
  code: string;
  accrued: number;
  used: number;
  carried_in: number;
  encashed: number;
  available: number;      // what they can actually book right now
  infinite: boolean;      // unpaid
};

/** What's left to book. Carried-forward days are usable, encashed ones aren't. */
export function availableOf(b: { accrued?: number; used?: number; carried_in?: number; encashed?: number }, infinite = false): number {
  if (infinite) return Infinity;
  const v = Number(b.accrued || 0) + Number(b.carried_in || 0) - Number(b.used || 0) - Number(b.encashed || 0);
  return Math.max(0, Math.round(v * 2) / 2);   // half-day precision
}

/** How a balance reads in a dropdown. */
export function balanceLabel(available: number, infinite: boolean): string {
  if (infinite) return "infinite balance";
  if (available <= 0) return "Not Available";
  return `${available % 1 === 0 ? available : available.toFixed(1)} ${available === 1 ? "day" : "days"} available`;
}

/**
 * How many days of leave does From→To actually cost?
 * Weekly offs and holidays inside the range don't consume balance — an
 * employee taking Friday to Monday over a Sunday off spends three days, not
 * four, which is what anyone would expect and what avoids arguments.
 */
export function leaveDaysBetween(
  from: string, to: string,
  opts: { weeklyOffs: number[]; holidays: Record<string, string>; halfDay?: boolean },
): { days: number; dates: string[]; skipped: string[] } {
  const all = dateRange(from, to);
  const dates: string[] = [], skipped: string[] = [];
  for (const d of all) {
    if (opts.holidays[d] || opts.weeklyOffs.includes(istWeekday(d))) skipped.push(d);
    else dates.push(d);
  }
  // A half day only makes sense on a single date.
  const days = opts.halfDay && dates.length === 1 ? 0.5 : dates.length;
  return { days, dates, skipped };
}

/**
 * Monthly accrual for one person, pro-rated if they joined mid-month.
 * Joining on the 20th of a 31-day month earns 12/31 of that month, rounded to
 * the nearest half day — a full month's credit for eleven days of work would
 * be wrong in the employee's favour, and no credit at all would be wrong in
 * the business's.
 */
export function accrualForMonth(type: LeaveType, monthTag: string, joiningDate?: string | null): number {
  if (type.accrual !== "monthly" || !type.enabled) return 0;
  const amount = Number(type.amount || 0);
  if (amount <= 0) return 0;

  if (joiningDate && joiningDate.slice(0, 7) === monthTag) {
    const year = Number(monthTag.slice(0, 4)), month = Number(monthTag.slice(5, 7));
    const daysInMonth = new Date(year, month, 0).getDate();
    const joinDay = Number(joiningDate.slice(8, 10));
    const worked = daysInMonth - joinDay + 1;
    return Math.round((amount * worked / daysInMonth) * 2) / 2;
  }
  // Joined after this month? Nothing yet.
  if (joiningDate && joiningDate.slice(0, 7) > monthTag) return 0;
  return amount;
}

/** Yearly types credit once, on 1 January (or on joining, if they joined later). */
export function accrualForYear(type: LeaveType, year: number, joiningDate?: string | null): number {
  if (type.accrual !== "yearly" || !type.enabled) return 0;
  const amount = Number(type.amount || 0);
  if (amount <= 0) return 0;
  if (joiningDate && Number(joiningDate.slice(0, 4)) > year) return 0;
  return amount;
}

/**
 * Year end, per the owner's caps: carry what's allowed, encash what's allowed
 * from the remainder, lapse the rest. Order matters and is deliberate —
 * carrying forward is worth more to the employee than encashment, so it goes
 * first.
 */
export function yearEndFor(
  balances: { code: string; available: number; carries_forward: boolean; encashable: boolean }[],
  carryCap: number, encashCap: number,
): Record<string, { carry: number; encash: number; lapse: number }> {
  const out: Record<string, { carry: number; encash: number; lapse: number }> = {};
  let carryLeft = Number(carryCap || 0), encashLeft = Number(encashCap || 0);

  // Carry the types that carry, biggest first, until the cap runs out.
  const sorted = [...balances].sort((a, b) => b.available - a.available);
  for (const b of sorted) {
    const carry = b.carries_forward ? Math.min(b.available, carryLeft) : 0;
    carryLeft -= carry;
    out[b.code] = { carry, encash: 0, lapse: 0 };
  }
  // Then encash from what's left over on encashable types.
  for (const b of sorted) {
    const remaining = b.available - out[b.code].carry;
    const encash = b.encashable ? Math.min(remaining, encashLeft) : 0;
    encashLeft -= encash;
    out[b.code].encash = encash;
    out[b.code].lapse = Math.max(0, remaining - encash);
  }
  return out;
}

/** One day's pay, used to price an encashment request. */
export function dayRate(monthlySalary: number): number {
  return Math.round((Number(monthlySalary || 0) / 30) * 100) / 100;
}

/** Can this person book this type today? Birthday leave is the only special case. */
export function typeBookable(
  code: string, fromDate: string, employee: { date_of_birth?: string | null },
): { ok: boolean; why?: string } {
  if (code !== "birthday") return { ok: true };
  if (!employee.date_of_birth) return { ok: false, why: "No date of birth on record — ask your manager to add it." };
  const dob = employee.date_of_birth.slice(5);      // MM-DD
  if (fromDate.slice(5) !== dob) return { ok: false, why: "Birthday leave can only be taken on your birthday." };
  return { ok: true };
}

/** Does an approved leave cover this date? Used by attendance classification. */
export function leaveOnDate(requests: any[], date: string): string | null {
  for (const r of requests) {
    if (r.status !== "approved") continue;
    if (date >= r.from_date && date <= r.to_date) return r.code;
  }
  return null;
}

export const CURRENT_YEAR = () => Number(istDate().slice(0, 4));
