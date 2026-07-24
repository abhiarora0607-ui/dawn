// app/api/team/data/route.ts
// Employee-scoped read API. Returns ONLY what the employee is permitted to
// see, and ONLY records assigned to them (contacts/orders where they are the
// handling employee). The owner's full dataset is never exposed here.

import { NextResponse } from "next/server";
import { getEmployee, hasPermission } from "@/lib/employee-auth";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }

export async function GET(req: Request) {
  const ctx = await getEmployee();
  const { url, key } = sb();
  if (!ctx || !url || !key) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const uid = ctx.uid;
  const empId = ctx.employeeId;

  // An employee working is the business being active — stamp it.
  try { const { touchActive } = await import("@/lib/touch"); await touchActive(url, key, uid); } catch {}

  // Include must-change-password flag for first-login prompt.
  let mustChange = false;
  try {
    const acc = (await (await fetch(`${url}/rest/v1/employee_accounts?id=eq.${ctx.accountId}&select=must_change_password&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    mustChange = !!acc?.must_change_password;
  } catch {}

  let directReports = 0;
  try {
    const kids = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&reports_to=eq.${ctx.employeeId}&status=eq.active&select=id`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json());
    directReports = Array.isArray(kids) ? kids.length : 0;
  } catch { /* a nav hint must never break the dashboard */ }

  const out: any = {
    me: {
      name: ctx.name, permissions: ctx.permissions, mustChangePassword: mustChange,
      // Drives which tabs appear. Someone with no reports never sees My Team.
      isManager: directReports > 0,
      directReports,
    },
  };

  try {
    // Contacts / leads / customers assigned to this employee
    // Leads and customers gate independently.
    if (hasPermission(ctx, "leads") || hasPermission(ctx, "customers")) {
      // full-scan: stats + list over own book
      const rows = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&employee_id=eq.${empId}&order=created_at.desc`, { headers: H(key), cache: "no-store" })).json();
      const all = Array.isArray(rows) ? rows : [];
      out.leads = hasPermission(ctx, "leads") ? all.filter((c: any) => !["Customer (Won)", "Lost"].includes(c.stage)) : [];
      out.customers = hasPermission(ctx, "customers") ? all.filter((c: any) => c.stage === "Customer (Won)") : [];
    }
    // Orders handled by this employee
    if (hasPermission(ctx, "orders")) {
      const rows = await (await fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&employee_id=eq.${empId}&order=date.desc`, { headers: H(key), cache: "no-store" })).json();
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
        revenue: hasPermission(ctx, "finance_view") ? myOrders.reduce((a: number, o: any) => a + (Number(o.amount_paid) || 0), 0) : null,
      };
    }
    // Their own current-month score — motivating, and only their own row.
    try {
      const { computeScores } = await import("@/lib/scoring");
      const [emps, allContacts, allSales, allTasks, acts] = await Promise.all([
        fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,status,is_owner,joining_date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
        // full-scan: team score math, minimal columns
        fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&select=id,stage,employee_id,follow_up_date,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
        fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&select=employee_id,amount_paid,date,order_status`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
        // full-scan: minimal columns for counts
        fetch(`${url}/rest/v1/tasks?uid=eq.${uid}&select=employee_id,done,done_at,due_date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
        fetch(`${url}/rest/v1/activities?uid=eq.${uid}&select=contact_id,type,content,created_at&limit=2000`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      ]);
      const result = computeScores({
        employees: Array.isArray(emps) ? emps : [],
        contacts: Array.isArray(allContacts) ? allContacts : [],
        sales: (Array.isArray(allSales) ? allSales : []).filter((s: any) => s.order_status !== "Cancelled"),
        tasks: Array.isArray(allTasks) ? allTasks : [],
        activities: Array.isArray(acts) ? acts : [],
      });
      const mine = result.scores.find((s: any) => s.employeeId === empId);
      if (mine) out.myScore = { score: mine.score, rank: mine.rank, tooNew: mine.tooNew, isTop: result.top?.employeeId === empId, breakdown: mine.breakdown };
    } catch {}

    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}
