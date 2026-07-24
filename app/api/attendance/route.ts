// app/api/attendance/route.ts
// The owner's view of attendance. Three shapes from one route:
//
//   ?view=today            who's in, who's out, who hasn't shown
//   ?view=employee&id=…    one person's history over a range
//   ?view=month&month=…    everyone × every day, for payroll
//
// CRM area, uid-scoped, like every other business surface.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getAttSettings, getHolidays, daysForRange, rulesFor } from "@/lib/attendance-db";
import { approvedLeaveMap } from "@/lib/leave-db";
import { istDate, addDays, dateRange, istWeekday, workedMinutesOf, dayValue } from "@/lib/attendance";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const area = await requireArea(url, key, uid, "crm");
  if (area) return NextResponse.json(area, { status: 403 });

  try {
    const sp = new URL(req.url).searchParams;
    const view = sp.get("view") || "today";
    const today = istDate();

    const [settings, employees] = await Promise.all([
      getAttSettings(url, key, uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=*&order=is_owner.desc,name.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const EMP = (Array.isArray(employees) ? employees : []).filter((e: any) => !e.attendance_exempt);

    // ---------------------------------------------------------- TODAY BOARD
    if (view === "today") {
      const [logs, days, holidays, todayLeave] = await Promise.all([
        fetch(`${url}/rest/v1/attendance_logs?uid=eq.${uid}&work_date=eq.${today}&select=*&order=punch_in.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
        fetch(`${url}/rest/v1/attendance_days?uid=eq.${uid}&work_date=eq.${today}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
        getHolidays(url, key, uid, today, today),
        approvedLeaveMap(url, key, uid, today, today),
      ]);
      const logsByEmp: Record<string, any[]> = {};
      for (const l of Array.isArray(logs) ? logs : []) (logsByEmp[l.employee_id] ||= []).push(l);
      const dayByEmp: Record<string, any> = {};
      for (const d of Array.isArray(days) ? days : []) dayByEmp[d.employee_id] = d;

      const rows = EMP.map((e: any) => {
        const r = rulesFor(e, settings);
        const mine = logsByEmp[e.id] || [];
        const open = mine.find((l: any) => l.punch_in && !l.punch_out) || null;
        const d = dayByEmp[e.id];
        const onLeave = todayLeave[e.id]?.[today];
        const isOff = holidays[today] ? "holiday" : r.weeklyOffs.includes(istWeekday(today)) ? "weekly_off" : onLeave ? "leave" : null;
        return {
          id: e.id, name: e.name, role: e.role, status: e.status,
          onShift: !!open,
          since: open?.punch_in || null,
          firstIn: mine[0]?.punch_in || null,
          lastOut: [...mine].reverse().find((l: any) => l.punch_out)?.punch_out || null,
          minutes: workedMinutesOf(mine),
          classification: d?.classification || isOff || (mine.length ? "half" : "absent"),
          lateMinutes: d?.late_minutes || 0,
          flagged: !!d?.flagged || mine.some((l: any) => l.within_fence === false),
          flagReason: d?.flag_reason || (mine.some((l: any) => l.within_fence === false) ? "Punched outside the shop area" : null),
          remote: !!e.remote_permanent,
          requiredHours: r.requiredHours,
          punches: mine.map((l: any) => ({ in: l.punch_in, out: l.punch_out, withinFence: l.within_fence, distance: l.distance_m })),
        };
      });

      return NextResponse.json({
        today,
        holidayName: holidays[today] || null,
        shopSet: settings.shop_lat != null && settings.shop_lng != null,
        enabled: settings.enabled,
        rows,
        summary: {
          onShift: rows.filter((r) => r.onShift).length,
          present: rows.filter((r) => r.minutes > 0 || r.onShift).length,
          off: rows.filter((r) => r.classification === "weekly_off" || r.classification === "holiday").length,
          absent: rows.filter((r) => r.classification === "absent").length,
          flagged: rows.filter((r) => r.flagged).length,
        },
      });
    }

    // ------------------------------------------------------ ONE PERSON'S LOG
    if (view === "employee") {
      const id = sp.get("id");
      if (!id) return NextResponse.json({ error: "Missing employee." }, { status: 400 });
      const emp = EMP.find((e: any) => e.id === id) || (Array.isArray(employees) ? employees : []).find((e: any) => e.id === id);
      if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

      const from = sp.get("from") || addDays(today, -29);
      const to = sp.get("to") || today;
      const [days, logs] = await Promise.all([
        daysForRange(url, key, uid, id, from, to, emp),
        fetch(`${url}/rest/v1/attendance_logs?uid=eq.${uid}&employee_id=eq.${id}&work_date=gte.${from}&work_date=lte.${to}&select=*&order=punch_in.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      ]);
      const logsByDate: Record<string, any[]> = {};
      for (const l of Array.isArray(logs) ? logs : []) (logsByDate[l.work_date] ||= []).push(l);

      const r = rulesFor(emp, settings);
      const withLogs = days.map((d: any) => ({ ...d, logs: logsByDate[d.work_date] || [] }));
      return NextResponse.json({
        employee: {
          id: emp.id, name: emp.name, role: emp.role,
          shiftStart: emp.shift_start, shiftEnd: emp.shift_end,
          requiredHours: r.requiredHours, weeklyOffs: r.weeklyOffs,
          remote: !!emp.remote_permanent, joiningDate: emp.joining_date,
        },
        range: { from, to },
        days: withLogs,
        totals: totalsOf(withLogs),
      });
    }

    // ------------------------------------------------------------ MONTH GRID
    const month = sp.get("month") || today.slice(0, 7);
    const from = `${month}-01`;
    const to = addDays(`${month}-01`, new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() - 1);
    const [allDays, holidays, leaveMap] = await Promise.all([
      fetch(`${url}/rest/v1/attendance_days?uid=eq.${uid}&work_date=gte.${from}&work_date=lte.${to}&select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      getHolidays(url, key, uid, from, to),
      approvedLeaveMap(url, key, uid, from, to),
    ]);
    const byEmpDate: Record<string, Record<string, any>> = {};
    for (const d of Array.isArray(allDays) ? allDays : []) {
      (byEmpDate[d.employee_id] ||= {})[d.work_date] = d;
    }
    const dates = dateRange(from, to);
    const grid = EMP.map((e: any) => {
      const r = rulesFor(e, settings);
      const cells = dates.map((date) => {
        const stored = byEmpDate[e.id]?.[date];
        if (stored) return { date, c: stored.classification, m: stored.worked_minutes, f: stored.flagged };
        if (r.joiningDate && date < r.joiningDate) return { date, c: "not_joined", m: 0, f: false };
        if (holidays[date]) return { date, c: "holiday", m: 0, f: false };
        if (r.weeklyOffs.includes(istWeekday(date))) return { date, c: "weekly_off", m: 0, f: false };
        // Approved leave shows whether it's past or future — a roster that
        // hides next week's booked leave is no use for planning.
        if (leaveMap[e.id]?.[date]) return { date, c: "leave", m: 0, f: false };
        if (date > today) return { date, c: "not_joined", m: 0, f: false };
        return { date, c: "absent", m: 0, f: false };
      });
      return {
        id: e.id, name: e.name, role: e.role, cells,
        totals: totalsOf(cells.map((c) => ({ classification: c.c, worked_minutes: c.m, late_minutes: 0 }))),
      };
    });

    return NextResponse.json({ month, from, to, today, dates, holidays, grid });
  } catch {
    return NextResponse.json({ error: "Couldn't load attendance." }, { status: 500 });
  }
}

function totalsOf(days: any[]) {
  let present = 0, minutes = 0, absent = 0, half = 0, off = 0, leave = 0, lateDays = 0, flagged = 0;
  for (const d of days) {
    const c = d.classification;
    present += dayValue(c);
    minutes += Number(d.worked_minutes || 0);
    if (c === "absent") absent++;
    if (c === "half") half++;
    if (c === "weekly_off" || c === "holiday") off++;
    if (c === "leave") leave++;
    if (Number(d.late_minutes || 0) > 0) lateDays++;
    if (d.flagged) flagged++;
  }
  return { presentDays: present, workedMinutes: minutes, absentDays: absent, halfDays: half, offDays: off, leaveDays: leave, lateDays, flaggedDays: flagged };
}
