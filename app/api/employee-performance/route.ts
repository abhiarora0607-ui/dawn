// app/api/employee-performance/route.ts
// Admin-only per-employee analytics: revenue, orders, leads, conversion,
// pending work, across time windows. Computed from real CRM data.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }

function inWindow(dateStr: string, win: string): boolean {
  const d = new Date(dateStr).getTime();
  const now = Date.now();
  const day = 86400000;
  if (win === "day") return now - d < day;
  if (win === "week") return now - d < 7 * day;
  if (win === "month") return now - d < 30 * day;
  if (win === "year") return now - d < 365 * day;
  return true; // all
}

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ employees: [] });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const win = new URL(req.url).searchParams.get("window") || "all";

  try {
    const [employees, contacts, sales, expenses] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,status,monthly_salary&order=name.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // full-scan: performance math over the book, minimal columns
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=id,stage,employee_id,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&select=employee_id,total,amount_paid,balance,fixed_cost,date,order_status,status`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // full-scan: commission math over full history
      fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&select=amount,source,source_id,date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const E = Array.isArray(employees) ? employees : [];
    const C = Array.isArray(contacts) ? contacts : [];
    const S = (Array.isArray(sales) ? sales : []).filter((s: any) => s.order_status !== "Cancelled");

    const rows = E.map((emp: any) => {
      const myContacts = C.filter((c: any) => c.employee_id === emp.id && inWindow(c.created_at, win));
      const myLeads = myContacts.filter((c: any) => !["Customer (Won)", "Lost"].includes(c.stage));
      const myCustomers = myContacts.filter((c: any) => c.stage === "Customer (Won)");
      const myOrders = S.filter((s: any) => s.employee_id === emp.id && inWindow(s.date, win));

      const revenue = myOrders.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
      const orderCost = myOrders.reduce((a: number, s: any) => a + (Number(s.fixed_cost) || 0), 0);
      const pendingAmount = myOrders.reduce((a: number, s: any) => a + (Number(s.balance) || 0), 0);
      const delivered = myOrders.filter((s: any) => s.order_status === "Delivered").length;
      const pendingOrders = myOrders.filter((s: any) => s.order_status !== "Delivered").length;
      const totalContacts = myContacts.length;
      const conversion = totalContacts > 0 ? Math.round((myCustomers.length / totalContacts) * 100) : 0;

      return {
        id: emp.id, name: emp.name, status: emp.status,
        revenue, expenses: orderCost, pendingAmount,
        leads: myLeads.length, customers: myCustomers.length,
        orders: myOrders.length, delivered, pendingOrders,
        conversion, avgOrderValue: myOrders.length ? Math.round(revenue / myOrders.length) : 0,
      };
    });

    // Sort by revenue desc for easy comparison
    rows.sort((a, b) => b.revenue - a.revenue);
    return NextResponse.json({ employees: rows, window: win });
  } catch {
    return NextResponse.json({ employees: [] });
  }
}
