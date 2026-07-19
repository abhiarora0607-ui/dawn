// Attendance rule tests. Run with:
//   node --experimental-strip-types scripts/test-attendance.mts
//
// These rules decide what shows up in someone's attendance record, so they get
// asserted rather than eyeballed. Every case here is one an owner or employee
// would notice immediately if it broke.
import * as A from "../lib/attendance.ts";

const base = { requiredHours: 8, halfDayPct: 50, fullDayPct: 100, weeklyOffs: [0], date: "2026-07-15" };
// times given in IST hours; convert to the UTC instant
const mk = (i: number, o: number | null) => ({
  punch_in: new Date(Date.parse("2026-07-15T00:00:00Z") + (i * 60 - 330) * 60000).toISOString(),
  punch_out: o ? new Date(Date.parse("2026-07-15T00:00:00Z") + (o * 60 - 330) * 60000).toISOString() : null,
});

const t: [string, any, string][] = [];
t.push(["8h = full", A.classifyDay({ ...base, logs: [mk(9, 17)] }).classification, "full"]);
t.push(["3h of 8 = absent (sub-50%)", A.classifyDay({ ...base, logs: [mk(13, 15), mk(16, 17)] }).classification, "absent"]);
t.push(["5h of 8 = half", A.classifyDay({ ...base, logs: [mk(9, 14)] }).classification, "half"]);
t.push(["pairs sum to 180m", String(A.workedMinutesOf([mk(13, 15), mk(16, 17)])), "180"]);
t.push(["sunday = weekly off", A.classifyDay({ ...base, date: "2026-07-19", logs: [] }).classification, "weekly_off"]);
t.push(["holiday wins", A.classifyDay({ ...base, logs: [mk(9, 17)], isHoliday: true }).classification, "holiday"]);
t.push(["approved leave wins", A.classifyDay({ ...base, logs: [], leaveCode: "casual" }).classification, "leave"]);
const mp = A.classifyDay({ ...base, logs: [mk(9, null)], isToday: false });
t.push(["missed punch-out", mp.classification, "missing_punch_out"]);
t.push(["missed punch-out = 0 mins", String(mp.workedMinutes), "0"]);
t.push(["still on shift today", A.classifyDay({ ...base, logs: [mk(9, null)], isToday: true }).classification, "half"]);
t.push(["late 30m vs 09:00 shift", String(A.classifyDay({ ...base, logs: [mk(9.5, 17)], shiftStart: "09:00" }).lateMinutes), "30"]);
t.push(["no shift = never late", String(A.classifyDay({ ...base, logs: [mk(11, 17)] }).lateMinutes), "0"]);
t.push(["before joining", A.classifyDay({ ...base, logs: [], joiningDate: "2026-08-01" }).classification, "not_joined"]);
t.push(["IST 9pm stays today", A.istDate("2026-07-15T15:30:00Z"), "2026-07-15"]);
t.push(["IST past midnight rolls", A.istDate("2026-07-15T18:31:00Z"), "2026-07-16"]);
t.push(["fence inside", String(A.checkFence({ lat: 28.65, lng: 77.05, shopLat: 28.65, shopLng: 77.05, radiusM: 150 }).withinFence), "true"]);
t.push(["fence far away", String(A.checkFence({ lat: 28.70, lng: 77.05, shopLat: 28.65, shopLng: 77.05, radiusM: 150 }).withinFence), "false"]);
t.push(["no location = unknown", String(A.checkFence({ shopLat: 28.65, shopLng: 77.05 }).withinFence), "null"]);
t.push(["remote = exempt", String(A.checkFence({ isRemote: true }).exempt), "true"]);
t.push(["no shop set = unknown", String(A.checkFence({ lat: 28.65, lng: 77.05 }).withinFence), "null"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} ATTENDANCE RULES CORRECT ***` : `\n*** ${bad} RULE FAILURE(S) ***`);

// ---- V32: accuracy-aware fencing ----
const t2: [string, any, string][] = [];
const shop = { shopLat: 28.65, shopLng: 77.05, radiusM: 150 };
t2.push(["good fix inside", String(A.checkFence({ ...shop, lat: 28.65, lng: 77.05, accuracy: 20 }).withinFence), "true"]);
t2.push(["good fix far outside", String(A.checkFence({ ...shop, lat: 28.70, lng: 77.05, accuracy: 20 }).withinFence), "false"]);
// 200m away but ±300m accuracy — could be inside, so don't accuse
t2.push(["vague fix gets benefit of doubt", String(A.checkFence({ ...shop, lat: 28.6518, lng: 77.05, accuracy: 300 }).withinFence), "true"]);
// useless accuracy is not a location at all
t2.push(["2km accuracy = unknown", String(A.checkFence({ ...shop, lat: 28.65, lng: 77.05, accuracy: 5000 }).withinFence), "null"]);
t2.push(["no accuracy given still works", String(A.checkFence({ ...shop, lat: 28.65, lng: 77.05 }).withinFence), "true"]);
// far enough that even the margin can't save it
t2.push(["far outside despite margin", String(A.checkFence({ ...shop, lat: 28.68, lng: 77.05, accuracy: 100 }).withinFence), "false"]);

let bad2 = 0;
for (const [name, got, want] of t2) {
  const ok = String(got) === want;
  if (!ok) bad2++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad2 === 0 ? `*** ALL ${t2.length} FENCE RULES CORRECT ***` : `*** ${bad2} FENCE FAILURE(S) ***`);
