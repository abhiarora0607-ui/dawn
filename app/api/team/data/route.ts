// app/api/team/data/route.ts
// Employee-scoped read API. Returns ONLY what the employee is permitted to
// see, and ONLY records assigned to them (contacts/orders where they are the
// handling employee). The owner's full dataset is never exposed here.

import { NextResponse } from "next/server";
import { getEmployee, hasPermission } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string) { const k = key; return { apikey: k, Authorization: `Bearer ${k}` }; }

export async function GET(req: Request) {
  const ctx = await getEmployee();
  const { url, key } = sb();
  if (!ctx || !url || !key) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const uid = ctx.uid;
  const empId = ctx.employeeId;

  // Include must-change-password flag for first-login prompt.
  let mustChange = false;
  try {
    const acc = (await (await fetch(`${url}/rest/v1/employee_accounts?id=eq.${ctx.accountId}&select=must_change_password&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    mustChange = !!acc?.must_change_password;
  } catch {}

  const out: any = { me: { name: ctx.name, permissions: ctx.permissions, mustChangePassword: mustChange } };

  try {
    // Contacts / leads / customers assigned to this employee
    // Leads and customers gate independently.
    if (hasPermission(ctx, "leads") || hasPermission(ctx, "customers")) {
      const rows = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&employee_id=eq.${empId}&order=created_at.desc`, { headers: H(key), cache: "no-store" })).json();
      const all = Array.isArray(rows) ? rows : [];
      out.leads = hasPermission(ctx, "leads") ? all.filter((c: any) => !["Customer (Won)", "Lost"].includes(c.stage)) : [];
      out.customers = hasPermission(ctx, "customers") ? all.filter((c: any) => c.stage === "Customer (Won)") : [];
    }
    // Orders handled by this employee
    if (hasPermission(ctx, "orders")) {
      const rows = await (await fetch(`${url}/rest/v1/sales?uid=eq.${uid}&employee_id=eq.${empId}&order=date.desc`, { headers: H(key), cache: "no-store" })).json();
      out.orders = Array.isArray(rows) ? rows : [];
    }
    // Limited reports: counts only, no full financials unless permitted
    if (hasPermission(ctx, "reports") || hasPermission(ctx, "dashboard")) {
      const myOrders = out.orders || [];
      out.stats = {
        leads: (out.leads || []).length,
        customers: (out.customers || []).length,
        orders: myOrders.length,
        // Revenue only if they have financial permission
        revenue: hasPermission(ctx, "financials") ? myOrders.reduce((a: number, o: any) => a + (Number(o.amount_paid) || 0), 0) : null,
      };
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}
