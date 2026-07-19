// app/api/team/encash/route.ts
// Asking to be paid for unused leave. This is a request, never automatic:
// the employee asks, the owner approves, and only then does the amount ride
// along on the next salary expense.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { getLeaveTypes, getBalances } from "@/lib/leave-db";
import { LEAVE_LABEL, dayRate, CURRENT_YEAR } from "@/lib/leave";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const year = CURRENT_YEAR();
    const [types, empRows, requests] = await Promise.all([
      getLeaveTypes(url, key, ctx.uid),
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=monthly_salary&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/encashment_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=created_at.desc&limit=20`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const salary = Number(empRows?.[0]?.monthly_salary || 0);
    const balances = await getBalances(url, key, ctx.uid, ctx.employeeId, year, types);

    return NextResponse.json({
      perDay: dayRate(salary),
      options: types
        .filter((t) => t.enabled && t.encashable)
        .map((t) => {
          const b = balances.find((x) => x.code === t.code);
          return { code: t.code, label: LEAVE_LABEL[t.code], available: b?.available ?? 0 };
        })
        .filter((o) => o.available > 0),
      requests: Array.isArray(requests) ? requests.map((r: any) => ({ ...r, label: LEAVE_LABEL[r.code] })) : [],
    });
  } catch { return NextResponse.json({ error: "Couldn't load." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const b = await req.json();
    const code = String(b.code || "");
    const days = Number(b.days || 0);
    if (days <= 0) return NextResponse.json({ error: "How many days?" }, { status: 400 });

    const year = CURRENT_YEAR();
    const types = await getLeaveTypes(url, key, ctx.uid);
    const type = types.find((t) => t.code === code && t.enabled && t.encashable);
    if (!type) return NextResponse.json({ error: "That leave type can't be encashed." }, { status: 400 });

    const balances = await getBalances(url, key, ctx.uid, ctx.employeeId, year, types);
    const available = balances.find((x) => x.code === code)?.available ?? 0;
    if (days > available) return NextResponse.json({ error: `You only have ${available} ${available === 1 ? "day" : "days"} of ${LEAVE_LABEL[code]}.` }, { status: 400 });

    const pending = await fetch(`${url}/rest/v1/encashment_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&status=eq.pending&select=id&limit=1`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
    if (Array.isArray(pending) && pending.length) return NextResponse.json({ error: "You already have an encashment request waiting." }, { status: 400 });

    await fetch(`${url}/rest/v1/encashment_requests`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid: ctx.uid, employee_id: ctx.employeeId, code, days, status: "pending", note: String(b.note || "").slice(0, 300) || null }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Couldn't send that request." }, { status: 500 }); }
}
