// app/api/team/attendance/route.ts
// The employee's own attendance: punch in, punch out, and see their history.
//
// No permission gate — every employee punches regardless of which CRM areas
// they can see. Attendance belongs to the person, not to a role.
//
// The geofence records rather than refuses by default. A blocked punch means
// somebody who genuinely worked has no record of it, which becomes a pay
// dispute; a flagged punch gives the owner the same information without that
// cost. Owners who want it strict can switch enforcement on.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { getAttSettings, isRemoteOn, recomputeDay, daysForRange, rulesFor } from "@/lib/attendance-db";
import { checkFence, istDate, addDays, workedMinutesOf } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const sp = new URL(req.url).searchParams;
    const today = istDate();
    const from = sp.get("from") || addDays(today, -29);
    const to = sp.get("to") || today;

    const [settings, empRows] = await Promise.all([
      getAttSettings(url, key, ctx.uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const emp = Array.isArray(empRows) ? empRows[0] : null;
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const [todayLogs, days] = await Promise.all([
      fetch(`${url}/rest/v1/attendance_logs?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&work_date=eq.${today}&select=*&order=punch_in.asc`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      daysForRange(url, key, ctx.uid, ctx.employeeId, from, to, emp),
    ]);

    const logs = Array.isArray(todayLogs) ? todayLogs : [];
    const open = logs.find((l: any) => l.punch_in && !l.punch_out) || null;
    const r = rulesFor(emp, settings);

    return NextResponse.json({
      enabled: settings.enabled && !r.exempt,
      exempt: r.exempt,
      today,
      punchedIn: !!open,
      openSince: open?.punch_in || null,
      todayLogs: logs,
      todayMinutes: workedMinutesOf(logs),
      requiredHours: r.requiredHours,
      shiftStart: r.shiftStart, shiftEnd: r.shiftEnd,
      weeklyOffs: r.weeklyOffs,
      remote: !!emp.remote_permanent,
      shopSet: settings.shop_lat != null && settings.shop_lng != null,
      enforceGeofence: settings.enforce_geofence,
      joiningDate: emp.joining_date || null,
      days,
      range: { from, to },
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load attendance." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const b = await req.json().catch(() => ({}));
    const lat = b.lat != null ? Number(b.lat) : null;
    const lng = b.lng != null ? Number(b.lng) : null;
    const today = istDate();

    const [settings, empRows] = await Promise.all([
      getAttSettings(url, key, ctx.uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const emp = Array.isArray(empRows) ? empRows[0] : null;
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    if (!settings.enabled) return NextResponse.json({ error: "Attendance isn't switched on for this business." }, { status: 400 });
    if (emp.attendance_exempt) return NextResponse.json({ error: "You're not required to mark attendance." }, { status: 400 });

    // Is there an open punch to close?
    const openRows = await fetch(
      `${url}/rest/v1/attendance_logs?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&punch_out=is.null&select=*&order=punch_in.desc&limit=1`,
      { headers: empHeaders(key), cache: "no-store" },
    ).then((r) => r.json()).catch(() => []);
    const open = Array.isArray(openRows) ? openRows[0] : null;

    const remote = await isRemoteOn(url, key, ctx.uid, ctx.employeeId, today, emp);
    const fence = checkFence({
      lat, lng,
      shopLat: settings.shop_lat, shopLng: settings.shop_lng,
      radiusM: settings.geofence_radius_m,
      isRemote: remote,
    });

    // Strict mode: refuse a punch that's provably outside the shop. Only ever
    // blocks when we actually know the location — never on a denied permission.
    if (settings.enforce_geofence && fence.withinFence === false) {
      return NextResponse.json({
        error: `You're ${fence.distanceM}m from the shop. Attendance can only be marked at the shop.`,
        blocked: true,
      }, { status: 403 });
    }

    if (open) {
      // ---- PUNCH OUT ----
      await fetch(`${url}/rest/v1/attendance_logs?uid=eq.${ctx.uid}&id=eq.${open.id}`, {
        method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          punch_out: new Date().toISOString(),
          out_lat: lat, out_lng: lng,
          within_fence: open.within_fence === false ? false : fence.withinFence,
        }),
      });
      const day = await recomputeDay(url, key, ctx.uid, ctx.employeeId, open.work_date, { emp, settings });
      return NextResponse.json({ ok: true, action: "out", day, flagged: fence.withinFence === false, note: fence.reason });
    }

    // ---- PUNCH IN ----
    await fetch(`${url}/rest/v1/attendance_logs`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid: ctx.uid, employee_id: ctx.employeeId, work_date: today,
        punch_in: new Date().toISOString(),
        in_lat: lat, in_lng: lng,
        within_fence: fence.withinFence,
        distance_m: fence.distanceM,
        source: "punch",
      }),
    });
    const day = await recomputeDay(url, key, ctx.uid, ctx.employeeId, today, { emp, settings });
    return NextResponse.json({ ok: true, action: "in", day, flagged: fence.withinFence === false, note: fence.reason });
  } catch {
    return NextResponse.json({ error: "Couldn't record that punch." }, { status: 500 });
  }
}
