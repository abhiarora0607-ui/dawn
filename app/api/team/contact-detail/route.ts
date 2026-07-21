// app/api/team/contact-detail/route.ts
// Full context for ONE of the employee's own contacts: activity timeline and
// order history. Employees were previously flying blind on their own leads.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, hasPermission } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardEmployee("leads");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    // Ownership check first — an employee may only open their own contacts.
    const contact = (await (await fetch(`${url}/rest/v1/contacts?id=eq.${id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
    if (!contact) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [activities, orders] = await Promise.all([
      fetch(`${url}/rest/v1/activities?uid=eq.${ctx.uid}&contact_id=eq.${id}&order=created_at.desc&limit=30`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${ctx.uid}&deleted_at=is.null&contact_id=eq.${id}&order=date.desc&limit=20`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const showMoney = hasPermission(ctx, "finance_view");
    return NextResponse.json({
      contact,
      activities: Array.isArray(activities) ? activities : [],
      orders: (Array.isArray(orders) ? orders : []).map((o: any) => ({
        id: o.id, date: o.date, order_status: o.order_status, status: o.status,
        items: o.items, total: o.total, balance: o.balance,
      })),
      // Money figures are gated behind the financials permission.
      ltv: showMoney ? (Array.isArray(orders) ? orders : []).reduce((s: number, o: any) => s + (Number(o.amount_paid) || 0), 0) : null,
      outstanding: showMoney ? (Array.isArray(orders) ? orders : []).reduce((s: number, o: any) => s + (Number(o.balance) || 0), 0) : null,
    });
  } catch { return NextResponse.json({ error: "Failed to load." }, { status: 500 }); }
}
