// lib/attendance-db.ts
// The database side of attendance. Everything that needs to read settings or
// write a computed day goes through here, so punch, regularization, the owner
// views and the nightly cron all agree on what a day means.

import {
  classifyDay, istDate, istWeekday, dateRange,
  type LogRow, type Classification,
} from "@/lib/attendance";

function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type AttSettings = {
  uid: string;
  enabled: boolean;
  shop_lat: number | null; shop_lng: number | null;
  geofence_radius_m: number;
  enforce_geofence: boolean;
  required_hours: number;
  half_day_pct: number; full_day_pct: number;
  regularization_quota: number; regularization_back_days: number;
  default_weekly_offs: number[];
};

const DEFAULTS: Omit<AttSettings, "uid"> = {
  enabled: true,
  shop_lat: null, shop_lng: null,
  geofence_radius_m: 150,
  enforce_geofence: false,
  required_hours: 8,
  half_day_pct: 50, full_day_pct: 100,
  regularization_quota: 3, regularization_back_days: 10,
  default_weekly_offs: [0],
};

/** Settings for a business, lazily created so a new business just works. */
export async function getAttSettings(url: string, key: string, uid: string): Promise<AttSettings> {
  try {
    const rows = await fetch(`${url}/rest/v1/attendance_settings?uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) {
      return {
        ...DEFAULTS, ...row, uid,
        default_weekly_offs: Array.isArray(row.default_weekly_offs) ? row.default_weekly_offs : DEFAULTS.default_weekly_offs,
      };
    }
    await fetch(`${url}/rest/v1/attendance_settings`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ uid }),
    }).catch(() => {});
    return { ...DEFAULTS, uid };
  } catch {
    return { ...DEFAULTS, uid };
  }
}

/** The rules that apply to one person: their overrides, or the business default. */
export function rulesFor(emp: any, s: AttSettings) {
  return {
    requiredHours: emp?.required_hours != null ? Number(emp.required_hours) : Number(s.required_hours),
    weeklyOffs: Array.isArray(emp?.weekly_offs) && emp.weekly_offs.length ? emp.weekly_offs : s.default_weekly_offs,
    shiftStart: emp?.shift_start || null,
    shiftEnd: emp?.shift_end || null,
    joiningDate: emp?.joining_date || null,
    exempt: !!emp?.attendance_exempt,
  };
}

/** Is this employee free of the geofence today? Permanent remote, or a grant. */
export async function isRemoteOn(url: string, key: string, uid: string, employeeId: string, date: string, emp?: any): Promise<boolean> {
  if (emp?.remote_permanent) return true;
  try {
    const rows = await fetch(
      `${url}/rest/v1/remote_grants?uid=eq.${uid}&employee_id=eq.${employeeId}&from_date=lte.${date}&to_date=gte.${date}&select=id&limit=1`,
      { headers: H(key), cache: "no-store" },
    ).then((r) => r.json());
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

/** Holiday dates for a business within a range (or the whole year). */
export async function getHolidays(url: string, key: string, uid: string, from?: string, to?: string): Promise<Record<string, string>> {
  try {
    let q = `${url}/rest/v1/holidays?uid=eq.${uid}&select=holiday_date,name`;
    if (from) q += `&holiday_date=gte.${from}`;
    if (to) q += `&holiday_date=lte.${to}`;
    const rows = await fetch(q, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const map: Record<string, string> = {};
    for (const h of Array.isArray(rows) ? rows : []) map[h.holiday_date] = h.name;
    return map;
  } catch { return {}; }
}

/**
 * Recompute one person's day from their raw punches and store the result.
 * Called after every punch and every approved regularization, so the derived
 * table can never drift from the logs it summarises.
 */
export async function recomputeDay(
  url: string, key: string, uid: string, employeeId: string, date: string,
  opts?: { emp?: any; settings?: AttSettings; holidayName?: string | null; leaveCode?: string | null },
): Promise<{ classification: Classification; workedMinutes: number } | null> {
  try {
    const settings = opts?.settings || (await getAttSettings(url, key, uid));
    const emp = opts?.emp || (await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${employeeId}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]));
    if (!emp) return null;

    const logs: LogRow[] = await fetch(
      `${url}/rest/v1/attendance_logs?uid=eq.${uid}&employee_id=eq.${employeeId}&work_date=eq.${date}&select=punch_in,punch_out,within_fence&order=punch_in.asc`,
      { headers: H(key), cache: "no-store" },
    ).then((r) => r.json()).catch(() => []);

    const holidayName = opts?.holidayName !== undefined
      ? opts.holidayName
      : (await getHolidays(url, key, uid, date, date))[date] || null;

    const r = rulesFor(emp, settings);
    const result = classifyDay({
      date,
      logs: Array.isArray(logs) ? logs : [],
      requiredHours: r.requiredHours,
      halfDayPct: settings.half_day_pct,
      fullDayPct: settings.full_day_pct,
      weeklyOffs: r.weeklyOffs,
      isHoliday: !!holidayName,
      leaveCode: opts?.leaveCode ?? null,
      shiftStart: r.shiftStart,
      joiningDate: r.joiningDate,
      isToday: date === istDate(),
    });

    await fetch(`${url}/rest/v1/attendance_days`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        uid, employee_id: employeeId, work_date: date,
        worked_minutes: result.workedMinutes,
        classification: result.classification,
        leave_code: opts?.leaveCode ?? null,
        late_minutes: result.lateMinutes,
        flagged: result.flagged,
        flag_reason: result.flagReason,
        updated_at: new Date().toISOString(),
      }),
    });

    return { classification: result.classification, workedMinutes: result.workedMinutes };
  } catch { return null; }
}

/**
 * Days for a person over a range, filling gaps that have no stored row —
 * so a month view shows weekly offs and absences that were never punched.
 */
export async function daysForRange(
  url: string, key: string, uid: string, employeeId: string, from: string, to: string, emp?: any,
): Promise<any[]> {
  const settings = await getAttSettings(url, key, uid);
  const employee = emp || (await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${employeeId}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]));
  const [stored, holidays] = await Promise.all([
    fetch(`${url}/rest/v1/attendance_days?uid=eq.${uid}&employee_id=eq.${employeeId}&work_date=gte.${from}&work_date=lte.${to}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    getHolidays(url, key, uid, from, to),
  ]);
  const byDate: Record<string, any> = {};
  for (const d of Array.isArray(stored) ? stored : []) byDate[d.work_date] = d;

  const r = rulesFor(employee, settings);
  const today = istDate();
  return dateRange(from, to).map((date) => {
    const existing = byDate[date];
    if (existing) return { ...existing, holiday_name: holidays[date] || null };
    // No stored row: derive what the day means anyway.
    let classification: Classification = "absent";
    if (r.joiningDate && date < r.joiningDate) classification = "not_joined";
    else if (holidays[date]) classification = "holiday";
    else if (r.weeklyOffs.includes(istWeekday(date))) classification = "weekly_off";
    else if (date > today) classification = "not_joined"; // the future isn't absence
    return {
      uid, employee_id: employeeId, work_date: date,
      worked_minutes: 0, classification, late_minutes: 0,
      flagged: false, flag_reason: null, holiday_name: holidays[date] || null,
    };
  });
}
