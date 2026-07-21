// lib/leave-db.ts
// Database side of leave: the catalogue, balances, accrual, and the lookup
// attendance uses to know a day was approved time off rather than an absence.

import {
  LEAVE_CODES, LEAVE_LABEL, availableOf, accrualForMonth, accrualForYear,
  type LeaveType, type Balance,
} from "@/lib/leave";
import { istDate } from "@/lib/attendance";

function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const SEED: Record<string, Partial<LeaveType>> = {
  casual: { accrual: "monthly", amount: 1, enabled: true, carries_forward: false, encashable: false, sort_order: 1 },
  earned: { accrual: "monthly", amount: 2.5, enabled: true, carries_forward: true, encashable: true, sort_order: 2 },
  sick: { accrual: "monthly", amount: 1, enabled: true, carries_forward: false, encashable: false, sort_order: 3 },
  bereavement: { accrual: "yearly", amount: 3, enabled: true, carries_forward: false, encashable: false, sort_order: 4 },
  birthday: { accrual: "yearly", amount: 1, enabled: true, carries_forward: false, encashable: false, sort_order: 5 },
  marriage: { accrual: "yearly", amount: 3, enabled: true, carries_forward: false, encashable: false, sort_order: 6 },
  maternity: { accrual: "yearly", amount: 0, enabled: false, carries_forward: false, encashable: false, sort_order: 7 },
  paternity: { accrual: "yearly", amount: 0, enabled: false, carries_forward: false, encashable: false, sort_order: 8 },
  unpaid: { accrual: "none", amount: 0, enabled: true, carries_forward: false, encashable: false, sort_order: 9 },
};

/** The business's leave catalogue, seeded on first read so it always exists. */
export async function getLeaveTypes(url: string, key: string, uid: string): Promise<LeaveType[]> {
  let rows: any[] = [];
  try {
    rows = await fetch(`${url}/rest/v1/leave_types?uid=eq.${uid}&select=*&order=sort_order.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
  } catch { rows = []; }
  if (!Array.isArray(rows)) rows = [];

  // Seed anything missing — including codes added in a later version, so an
  // older business doesn't quietly lack a type the UI expects.
  const have = new Set(rows.map((r: any) => r.code));
  const missing = LEAVE_CODES.filter((c) => !have.has(c));
  if (missing.length) {
    const toInsert = missing.map((code) => ({ uid, code, ...SEED[code] }));
    try {
      await fetch(`${url}/rest/v1/leave_types`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(toInsert),
      });
    } catch { /* fall through with defaults in memory */ }
    rows = [...rows, ...toInsert];
  }
  return rows
    .map((r: any) => ({ ...SEED[r.code], ...r, amount: Number(r.amount || 0) }) as LeaveType)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

/** Balances for one person this year, with availability computed. */
export async function getBalances(
  url: string, key: string, uid: string, employeeId: string, year: number, types?: LeaveType[],
): Promise<Balance[]> {
  const T = types || (await getLeaveTypes(url, key, uid));
  let rows: any[] = [];
  try {
    rows = await fetch(`${url}/rest/v1/leave_balances?uid=eq.${uid}&employee_id=eq.${employeeId}&year=eq.${year}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
  } catch { rows = []; }
  const byCode: Record<string, any> = {};
  for (const r of Array.isArray(rows) ? rows : []) byCode[r.code] = r;

  return T.filter((t) => t.enabled).map((t) => {
    const b = byCode[t.code] || {};
    const infinite = t.accrual === "none";
    return {
      code: t.code,
      accrued: Number(b.accrued || 0),
      used: Number(b.used || 0),
      carried_in: Number(b.carried_in || 0),
      granted: Number(b.granted || 0),
      encashed: Number(b.encashed || 0),
      available: availableOf(b, infinite),
      infinite,
    };
  });
}

/** Move a balance. Positive `usedDelta` consumes, negative returns. */
export async function adjustBalance(
  url: string, key: string, uid: string, employeeId: string, code: string, year: number,
  delta: { used?: number; accrued?: number; encashed?: number; carried_in?: number; lapsed?: number; last_accrued?: string },
) {
  const existing = await fetch(`${url}/rest/v1/leave_balances?uid=eq.${uid}&employee_id=eq.${employeeId}&code=eq.${code}&year=eq.${year}&select=*&limit=1`, { headers: H(key), cache: "no-store" })
    .then((r) => r.json()).then((r) => (Array.isArray(r) ? r[0] : null)).catch(() => null);

  const row: any = {
    uid, employee_id: employeeId, code, year,
    accrued: Number(existing?.accrued || 0) + Number(delta.accrued || 0),
    used: Math.max(0, Number(existing?.used || 0) + Number(delta.used || 0)),
    carried_in: Number(existing?.carried_in || 0) + Number(delta.carried_in || 0),
    encashed: Number(existing?.encashed || 0) + Number(delta.encashed || 0),
    lapsed: Number(existing?.lapsed || 0) + Number(delta.lapsed || 0),
    updated_at: new Date().toISOString(),
  };
  if (delta.last_accrued) row.last_accrued = delta.last_accrued;
  else if (existing?.last_accrued) row.last_accrued = existing.last_accrued;

  await fetch(`${url}/rest/v1/leave_balances`, {
    method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(row),
  });
}

/**
 * Credit this month's accrual for one person, once. The month tag on the
 * balance row makes this idempotent — running the cron twice in a day, or
 * re-running it after a failure, never gives anyone a second helping.
 */
export async function accrueMonth(
  url: string, key: string, uid: string, employee: any, monthTag: string, types?: LeaveType[],
): Promise<number> {
  const T = types || (await getLeaveTypes(url, key, uid));
  const year = Number(monthTag.slice(0, 4));
  let credited = 0;

  const existing = await fetch(`${url}/rest/v1/leave_balances?uid=eq.${uid}&employee_id=eq.${employee.id}&year=eq.${year}&select=code,last_accrued`, { headers: H(key), cache: "no-store" })
    .then((r) => r.json()).catch(() => []);
  const lastByCode: Record<string, string> = {};
  for (const r of Array.isArray(existing) ? existing : []) lastByCode[r.code] = r.last_accrued;

  for (const t of T) {
    if (!t.enabled || t.accrual === "none") continue;
    if (lastByCode[t.code] === monthTag) continue;                 // already done

    let amount = 0;
    if (t.accrual === "monthly") {
      amount = accrualForMonth(t, monthTag, employee.joining_date);
    } else if (t.accrual === "yearly") {
      // Yearly types land once, in January (or in the joining month if they
      // started later in the year — otherwise a June joiner waits until next
      // January for a bereavement day they might need in July).
      const isJan = monthTag.slice(5) === "01";
      const joinedThisMonth = employee.joining_date?.slice(0, 7) === monthTag;
      // Once per year for THIS type: if its own stamp is already in this year,
      // it's been credited. (The earlier check looked at every type's stamp,
      // which would have skipped a type whose turn had simply not come yet.)
      const stamp = lastByCode[t.code];
      const alreadyThisYear = !!stamp && Number(stamp.slice(0, 4)) === year;
      if ((isJan || joinedThisMonth) && !alreadyThisYear) amount = accrualForYear(t, year, employee.joining_date);
    }
    if (amount <= 0) {
      // Still stamp the month so we don't recheck this person all month.
      await adjustBalance(url, key, uid, employee.id, t.code, year, { last_accrued: monthTag });
      continue;
    }
    await adjustBalance(url, key, uid, employee.id, t.code, year, { accrued: amount, last_accrued: monthTag });
    credited += amount;
  }
  return credited;
}

/** Approved leave covering a date range, for attendance classification. */
export async function approvedLeaveMap(
  url: string, key: string, uid: string, from: string, to: string, employeeId?: string,
): Promise<Record<string, Record<string, string>>> {
  try {
    let q = `${url}/rest/v1/leave_requests?uid=eq.${uid}&status=eq.approved&to_date=gte.${from}&from_date=lte.${to}&select=employee_id,code,from_date,to_date`;
    if (employeeId) q += `&employee_id=eq.${employeeId}`;
    const rows = await fetch(q, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const out: Record<string, Record<string, string>> = {};
    for (const r of Array.isArray(rows) ? rows : []) {
      const emp = (out[r.employee_id] ||= {});
      let d = r.from_date > from ? r.from_date : from;
      const end = r.to_date < to ? r.to_date : to;
      let guard = 0;
      while (d <= end && guard++ < 400) {
        emp[d] = r.code;
        d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
      }
    }
    return out;
  } catch { return {}; }
}

export { LEAVE_LABEL };
