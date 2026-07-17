// app/api/team/reports/route.ts
// The employee's OWN performance stats (never other employees'). Revenue is
// included only with the financials permission.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, hasPermission } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

function inWindow(dateStr: string, win: string): boolean {
  const d = new Date(dateStr).getTime();
  const now = Date.now();
  const day = 86400000;
  if (win === "day") return now - d < day;
  if (win === "week") return now - d < 7 * day;
  if (win === "month") return now - d < 30 * day;
  if (win === "year") return now - d < 365 * day;
  return true;
}

export async function GET(req: Request) {
  const g = await guardEmployee("reports");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const win = new URL(req.url).searchParams.get("window") || "month";
  try {
    const [contacts, sales] = await Promise.all([
      fetch(`${url}/rest/v1/contacts?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&select=stage,created_at`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&select=total,amount_paid,balance,date,order_status`, { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const C = (Array.isArray(contacts) ? contacts : []).filter((c: any) => inWindow(c.created_at, win));
    const S = (Array.isArray(sales) ? sales : []).filter((s: any) => inWindow(s.date, win));
    const customers = C.filter((c: any) => c.stage === "Customer (Won)").length;
    const leads = C.filter((c: any) => !["Customer (Won)", "Lost"].includes(c.stage)).length;
    const lost = C.filter((c: any) => c.stage === "Lost").length;
    const revenue = S.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
    const stats = {
      window: win,
      leads, customers, lost,
      orders: S.length,
      delivered: S.filter((s: any) => s.order_status === "Delivered").length,
      pendingOrders: S.filter((s: any) => s.order_status !== "Delivered").length,
      pendingAmount: S.reduce((a: number, s: any) => a + (Number(s.balance) || 0), 0),
      conversion: C.length ? Math.round((customers / C.length) * 100) : 0,
      revenue: hasPermission(ctx, "financials") ? revenue : null,
      avgOrderValue: hasPermission(ctx, "financials") && S.length ? Math.round(revenue / S.length) : null,
    };
    return NextResponse.json({ stats });
  } catch { return NextResponse.json({ stats: null }); }
}
