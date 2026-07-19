// app/api/team/leave/route.ts
// The employee's leave: what they have, what they've asked for, and applying.
//
// Running out of balance never blocks an application. If someone asks for
// three days of casual and has two, the two are used and the third is simply
// unpaid — the day still gets recorded, which is what both sides actually
// need. Blocking would leave the business with an unexplained absence and the
// employee with nowhere to put a day they were always going to take.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { getAttSettings, getHolidays, rulesFor } from "@/lib/attendance-db";
import { getLeaveTypes, getBalances } from "@/lib/leave-db";
import { leaveDaysBetween, typeBookable, LEAVE_LABEL, balanceLabel, CURRENT_YEAR } from "@/lib/leave";
import { istDate } from "@/lib/attendance";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const year = CURRENT_YEAR();
    const [settings, empRows, types] = await Promise.all([
      getAttSettings(url, key, ctx.uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      getLeaveTypes(url, key, ctx.uid),
    ]);
    const emp = Array.isArray(empRows) ? empRows[0] : null;
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const [balances, requests] = await Promise.all([
      getBalances(url, key, ctx.uid, ctx.employeeId, year, types),
      fetch(`${url}/rest/v1/leave_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=from_date.desc&limit=50`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const r = rulesFor(emp, settings);

    return NextResponse.json({
      enabled: (settings as any).leave_enabled !== false,
      year,
      types: types.filter((t) => t.enabled).map((t) => {
        const b = balances.find((x) => x.code === t.code);
        return {
          code: t.code, label: LEAVE_LABEL[t.code],
          available: b?.infinite ? null : (b?.available ?? 0),
          carriedIn: b?.carried_in ?? 0,
          infinite: !!b?.infinite,
          balanceLabel: balanceLabel(b?.available ?? 0, !!b?.infinite),
          bookable: t.code !== "birthday" || !!emp.date_of_birth,
          encashable: t.encashable,
        };
      }),
      balances,
      requests: Array.isArray(requests) ? requests : [],
      weeklyOffs: r.weeklyOffs,
      hasDob: !!emp.date_of_birth,
      today: istDate(),
    });
  } catch { return NextResponse.json({ error: "Couldn't load leave." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const b = await req.json();

    // ---- cancel a pending request ----
    if (b.action === "cancel") {
      const rows = await fetch(`${url}/rest/v1/leave_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&id=eq.${b.id}&select=status&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json());
      if (!rows?.[0]) return NextResponse.json({ error: "Request not found." }, { status: 404 });
      if (rows[0].status !== "pending") return NextResponse.json({ error: "Only pending requests can be cancelled." }, { status: 400 });
      await fetch(`${url}/rest/v1/leave_requests?uid=eq.${ctx.uid}&id=eq.${b.id}`, {
        method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "cancelled", decided_at: new Date().toISOString() }),
      });
      return NextResponse.json({ ok: true });
    }

    // ---- apply ----
    const code = String(b.code || "");
    const from = String(b.from || ""), to = String(b.to || b.from || "");
    const reason = String(b.reason || "").trim().slice(0, 500);
    const halfDay = !!b.halfDay;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "Pick your dates." }, { status: 400 });
    if (to < from) return NextResponse.json({ error: "The end date can't be before the start." }, { status: 400 });

    const [settings, empRows, types] = await Promise.all([
      getAttSettings(url, key, ctx.uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      getLeaveTypes(url, key, ctx.uid),
    ]);
    const emp = Array.isArray(empRows) ? empRows[0] : null;
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const type = types.find((t) => t.code === code && t.enabled);
    if (!type) return NextResponse.json({ error: "That leave type isn't available." }, { status: 400 });

    const bookable = typeBookable(code, from, emp);
    if (!bookable.ok) return NextResponse.json({ error: bookable.why }, { status: 400 });

    // Weekly offs and holidays inside the range are free.
    const holidays = await getHolidays(url, key, ctx.uid, from, to);
    const r = rulesFor(emp, settings);
    const { days, dates } = leaveDaysBetween(from, to, { weeklyOffs: r.weeklyOffs, holidays, halfDay });
    if (days <= 0) return NextResponse.json({ error: "Those dates are all weekly offs or holidays — no leave needed." }, { status: 400 });

    // Overlap check: two approved leaves on the same day would double-count.
    const clash = await fetch(
      `${url}/rest/v1/leave_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&status=in.(pending,approved)&to_date=gte.${from}&from_date=lte.${to}&select=id&limit=1`,
      { headers: empHeaders(key), cache: "no-store" },
    ).then((r) => r.json()).catch(() => []);
    if (Array.isArray(clash) && clash.length) return NextResponse.json({ error: "You already have leave requested for some of those days." }, { status: 400 });

    // Shortfall becomes unpaid rather than a refusal.
    const balances = await getBalances(url, key, ctx.uid, ctx.employeeId, CURRENT_YEAR(), types);
    const bal = balances.find((x) => x.code === code);
    const infinite = !!bal?.infinite;
    const available = infinite ? Infinity : (bal?.available ?? 0);
    const shortfall = infinite ? 0 : Math.max(0, days - available);

    await fetch(`${url}/rest/v1/leave_requests`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid: ctx.uid, employee_id: ctx.employeeId, code,
        from_date: from, to_date: to, days, half_day: halfDay,
        reason: reason || null, status: "pending",
        is_unpaid_fallback: shortfall > 0,
      }),
    });

    return NextResponse.json({
      ok: true, days, dates: dates.length,
      unpaidDays: shortfall,
      note: shortfall > 0
        ? `${available} ${available === 1 ? "day" : "days"} will come from your ${LEAVE_LABEL[code]} balance and ${shortfall} will be unpaid.`
        : null,
    });
  } catch { return NextResponse.json({ error: "Couldn't send that request." }, { status: 500 }); }
}
