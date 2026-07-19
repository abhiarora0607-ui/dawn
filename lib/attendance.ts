// lib/attendance.ts
// The attendance brain. Everything that decides what a day *means* lives here,
// so the APIs stay thin and the rules stay testable.
//
// Two things this file takes seriously:
//
//  1. TIME IS IST. A shop closing at 9:30pm IST is still "today" — in UTC it's
//     already tomorrow. Every date in attendance is an IST calendar date, or
//     the evening shift silently lands on the wrong day and nobody can work out
//     why their hours moved.
//
//  2. NEVER INVENT DATA. If someone forgets to punch out, we record zero and
//     flag it. We do not guess they worked their required hours — a guess in
//     an attendance system becomes a guess in someone's pay.

export const IST_OFFSET_MIN = 330; // UTC+5:30

// ---------------------------------------------------------------- IST dates

/** The IST calendar date (YYYY-MM-DD) for a moment in time. */
export function istDate(d: Date | string | number = new Date()): string {
  const t = new Date(d).getTime();
  return new Date(t + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

/** Minutes past IST midnight for a moment in time. */
export function istMinutes(d: Date | string | number): number {
  const shifted = new Date(new Date(d).getTime() + IST_OFFSET_MIN * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** Day of week in IST. 0 = Sunday … 6 = Saturday. */
export function istWeekday(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** "09:15" → 555 minutes. Tolerates "09:15:00". */
export function hhmmToMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 555 → "9:15 AM" — how a person reads a time. */
export function minutesToLabel(mins?: number | null): string {
  if (mins == null) return "—";
  const h24 = Math.floor(mins / 60) % 24, m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/** 545 minutes → "9h 5m". The unit every attendance screen speaks. */
export function fmtDuration(mins?: number | null): string {
  if (!mins || mins <= 0) return "0h 0m";
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** Every IST date from `from` to `to`, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  let cur = new Date(`${from}T00:00:00Z`).getTime();
  while (cur <= end && out.length < 400) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
  }
  return out;
}

/** Add days to an IST date string. */
export function addDays(dateStr: string, days: number): string {
  return new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- geofence

/** Metres between two lat/lng points (haversine). */
export function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export type FenceCheck = {
  withinFence: boolean | null;   // null = couldn't tell (no location, or no shop set)
  distanceM: number | null;
  exempt: boolean;               // remote employee or remote grant — fence doesn't apply
  reason: string | null;         // why it's flagged, in words
};

/**
 * Is this punch inside the shop? Answers honestly, including "I don't know".
 * Note this never *decides* whether to allow the punch — that's the caller's
 * job, and by default a failed check flags rather than blocks.
 */
export function checkFence(opts: {
  lat?: number | null; lng?: number | null;
  accuracy?: number | null;
  shopLat?: number | null; shopLng?: number | null;
  radiusM?: number | null;
  isRemote?: boolean;
}): FenceCheck {
  if (opts.isRemote) return { withinFence: true, distanceM: null, exempt: true, reason: null };
  if (opts.shopLat == null || opts.shopLng == null) {
    return { withinFence: null, distanceM: null, exempt: false, reason: null }; // no shop location set yet
  }
  if (opts.lat == null || opts.lng == null) {
    return { withinFence: null, distanceM: null, exempt: false, reason: "Location unavailable" };
  }

  // A reading is only useful if the device is reasonably sure of it. Wifi
  // positioning indoors routinely reports accuracy of a kilometre or more —
  // treating that as a real position is exactly how someone standing behind
  // the counter gets told they're half a mile away. Unknown beats wrong.
  const accuracy = opts.accuracy != null ? Number(opts.accuracy) : null;
  if (accuracy != null && accuracy > MAX_USABLE_ACCURACY_M) {
    return { withinFence: null, distanceM: null, exempt: false, reason: `Location too vague to check (±${Math.round(accuracy)}m)` };
  }

  const d = distanceMetres(opts.lat, opts.lng, opts.shopLat, opts.shopLng);
  const radius = Number(opts.radiusM || 150);

  // Give the reading the benefit of its own margin of error: if the person
  // could be inside the fence once accuracy is accounted for, they're inside.
  // Being generous here costs the owner a flag; being strict costs someone
  // their pay for a day they worked.
  const effectiveRadius = radius + Math.min(accuracy ?? 0, radius);
  const within = d <= effectiveRadius;

  return {
    withinFence: within,
    distanceM: d,
    exempt: false,
    reason: within ? null : `Punched ${d}m from the shop`,
  };
}

/** Beyond this, a browser's position is a guess rather than a location. */
export const MAX_USABLE_ACCURACY_M = 2000;

// ------------------------------------------------------------ classification

export type Classification =
  | "full" | "half" | "absent" | "weekly_off" | "holiday"
  | "leave" | "missing_punch_out" | "not_joined";

export type DayResult = {
  workedMinutes: number;
  classification: Classification;
  lateMinutes: number;
  flagged: boolean;
  flagReason: string | null;
};

export type LogRow = { punch_in?: string | null; punch_out?: string | null; within_fence?: boolean | null };

/** Total worked minutes across every in/out pair. Open pairs count as zero. */
export function workedMinutesOf(logs: LogRow[]): number {
  let total = 0;
  for (const l of logs) {
    if (!l.punch_in || !l.punch_out) continue;
    const mins = Math.round((new Date(l.punch_out).getTime() - new Date(l.punch_in).getTime()) / 60000);
    if (mins > 0 && mins < 20 * 60) total += mins;  // ignore absurd spans
  }
  return total;
}

/**
 * What does this day mean for this person? Precedence matters and is
 * deliberate: a holiday is a holiday even if someone came in, and approved
 * leave beats "absent" so nobody is marked down for a day they'd cleared.
 */
export function classifyDay(input: {
  date: string;
  logs: LogRow[];
  requiredHours: number;
  halfDayPct: number;
  fullDayPct: number;
  weeklyOffs: number[];
  isHoliday?: boolean;
  leaveCode?: string | null;          // approved leave for this date (V31b)
  shiftStart?: string | null;         // "09:00" — no shift means never late
  joiningDate?: string | null;
  isToday?: boolean;
}): DayResult {
  const {
    date, logs, requiredHours, halfDayPct, fullDayPct,
    weeklyOffs, isHoliday, leaveCode, shiftStart, joiningDate, isToday,
  } = input;

  const worked = workedMinutesOf(logs);
  const hasOpenPunch = logs.some((l) => l.punch_in && !l.punch_out);
  const outsideFence = logs.some((l) => l.within_fence === false);

  // Before they joined, this day simply isn't theirs.
  if (joiningDate && date < joiningDate) {
    return { workedMinutes: 0, classification: "not_joined", lateMinutes: 0, flagged: false, flagReason: null };
  }

  // Late is only meaningful against a shift the owner actually set.
  let lateMinutes = 0;
  const shiftMin = hhmmToMinutes(shiftStart);
  const firstIn = logs.filter((l) => l.punch_in).map((l) => istMinutes(l.punch_in!)).sort((a, b) => a - b)[0];
  if (shiftMin != null && firstIn != null && firstIn > shiftMin) lateMinutes = firstIn - shiftMin;

  const flagReason = outsideFence ? "Punched outside the shop area" : null;

  // Precedence: holiday → weekly off → approved leave → punch state → hours.
  if (isHoliday) {
    const cameIn = worked > 0;
    return {
      workedMinutes: worked, classification: "holiday", lateMinutes: 0,
      flagged: !!flagReason || cameIn,
      flagReason: flagReason || (cameIn ? `Worked ${fmtDuration(worked)} on a holiday` : null),
    };
  }
  if (weeklyOffs.includes(istWeekday(date))) {
    const cameIn = worked > 0;
    return {
      workedMinutes: worked, classification: "weekly_off", lateMinutes: 0,
      flagged: !!flagReason || cameIn,
      flagReason: flagReason || (cameIn ? `Worked ${fmtDuration(worked)} on a day off` : null),
    };
  }
  if (leaveCode) {
    return { workedMinutes: worked, classification: "leave", lateMinutes: 0, flagged: false, flagReason: null };
  }

  // Still on shift right now — don't judge a day that hasn't finished.
  if (hasOpenPunch && isToday) {
    return { workedMinutes: worked, classification: "half", lateMinutes, flagged: !!flagReason, flagReason };
  }
  // Forgot to punch out. Zero hours, flagged — the employee can regularize it.
  if (hasOpenPunch) {
    return {
      workedMinutes: 0, classification: "missing_punch_out", lateMinutes,
      flagged: true, flagReason: "No punch-out recorded",
    };
  }

  // The owner's thresholds, applied literally:
  //   >= fullDayPct  of required hours → full day
  //   >= halfDayPct  but under full    → half day
  //   below halfDayPct                 → absent (counts as a full day's leave),
  //                                      even if they worked a little
  const requiredMin = Math.max(1, Math.round(requiredHours * 60));
  const pct = (worked / requiredMin) * 100;
  const classification: Classification =
    pct >= fullDayPct ? "full" : pct >= halfDayPct ? "half" : "absent";

  return {
    workedMinutes: worked,
    classification,
    lateMinutes,
    flagged: !!flagReason || (classification === "absent" && worked > 0),
    flagReason: flagReason || (classification === "absent" && worked > 0 ? `Only ${fmtDuration(worked)} worked` : null),
  };
}

// ------------------------------------------------------------------ display

export const CLASS_LABEL: Record<string, string> = {
  full: "Full day",
  half: "Half day",
  absent: "Absent",
  weekly_off: "Weekly off",
  holiday: "Holiday",
  leave: "On leave",
  missing_punch_out: "Missing punch-out",
  not_joined: "—",
};

export const CLASS_TONE: Record<string, string> = {
  full: "green",
  half: "amber",
  absent: "red",
  weekly_off: "grey",
  holiday: "sky",
  leave: "sky",
  missing_punch_out: "amber",
  not_joined: "grey",
};

/** How many days of attendance a classification is worth, for summaries. */
export function dayValue(c: string): number {
  return c === "full" ? 1 : c === "half" ? 0.5 : 0;
}
