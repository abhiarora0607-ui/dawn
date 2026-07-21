// app/api/team/my-team/route.ts
// A manager's view of their own people, inside the employee portal.
//
// Everything here is scoped through the org tree rather than trusted from the
// request — a manager asking about someone who isn't theirs gets nothing, not
// an error message confirming that person exists.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, hasPermission } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { istDate } from "@/lib/attendance";
import { approvedLeaveMap } from "@/lib/leave-db";
import { roleOf, ROLE_LABEL } from "@/lib/org";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const org = await loadOrg(url, key, ctx.uid, ctx.employeeId);
    const team = org.myTeam.filter((id) => id !== ctx.employeeId);

    if (team.length === 0) {
      return NextResponse.json({ team: [], pending: { leave: 0, fixes: 0 }, isManager: false });
    }

    const today = istDate();
    const monthStart = `${today.slice(0, 7)}-01`;

    // V45b: a lead sees what their team is producing, not just whether they
    // turned up. Revenue and expenses follow from managing someone — you can't
    // be accountable for a team's numbers without seeing them. Salary is
    // different and stays behind salary_view: managing four packers is not a
    // business reason to know what they earn.
    const canSeeSalary = org.isAdmin || hasPermission(ctx, "salary_view");

    const [people, days, leaveMap, pendingLeave, pendingFixes, sales, expenses] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=in.(${team.join(",")})&select=id,name,job_title,phone,email,status&order=name.asc`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/attendance_days?uid=eq.${ctx.uid}&work_date=eq.${today}&employee_id=in.(${team.join(",")})&select=employee_id,classification,worked_minutes,flagged`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      approvedLeaveMap(url, key, ctx.uid, today, today),
      fetch(`${url}/rest/v1/leave_requests?uid=eq.${ctx.uid}&status=eq.pending&employee_id=in.(${team.join(",")})&select=id`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/regularization_requests?uid=eq.${ctx.uid}&status=eq.pending&employee_id=in.(${team.join(",")})&select=id`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      // This month's collected revenue, per team member. Cancelled orders are
      // excluded — counting them would flatter the numbers.
      fetch(`${url}/rest/v1/sales?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=in.(${team.join(",")})&date=gte.${monthStart}&select=employee_id,amount_paid,order_status`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/expenses?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=in.(${team.join(",")})&date=gte.${monthStart}&select=employee_id,amount`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    // Totals per person, computed once rather than filtered per row.
    const revenueBy: Record<string, number> = {};
    const ordersBy: Record<string, number> = {};
    for (const o of Array.isArray(sales) ? sales : []) {
      if (o.order_status === "Cancelled") continue;
      revenueBy[o.employee_id] = (revenueBy[o.employee_id] || 0) + Number(o.amount_paid || 0);
      ordersBy[o.employee_id] = (ordersBy[o.employee_id] || 0) + 1;
    }
    const expenseBy: Record<string, number> = {};
    for (const e of Array.isArray(expenses) ? expenses : []) {
      expenseBy[e.employee_id] = (expenseBy[e.employee_id] || 0) + Number(e.amount || 0);
    }

    // Salary only when permitted — and fetched only then, so the figures never
    // reach the server response for someone who shouldn't see them.
    let salaryBy: Record<string, number> = {};
    if (canSeeSalary) {
      const rows = await fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=in.(${team.join(",")})&select=id,monthly_salary`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      for (const r of Array.isArray(rows) ? rows : []) salaryBy[r.id] = Number(r.monthly_salary || 0);
    }

    const dayBy: Record<string, any> = {};
    for (const d of Array.isArray(days) ? days : []) dayBy[d.employee_id] = d;

    // The lead's own figures, so the totals mean "my team including me" —
    // which is what someone accountable for a team actually reports on.
    const [mySales, myExpenses] = await Promise.all([
      fetch(`${url}/rest/v1/sales?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&date=gte.${monthStart}&select=amount_paid,order_status`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/expenses?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&date=gte.${monthStart}&select=amount`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const myRevenue = (Array.isArray(mySales) ? mySales : [])
      .filter((o: any) => o.order_status !== "Cancelled")
      .reduce((n: number, o: any) => n + Number(o.amount_paid || 0), 0);
    const myOrderCount = (Array.isArray(mySales) ? mySales : []).filter((o: any) => o.order_status !== "Cancelled").length;
    const myExpenseTotal = (Array.isArray(myExpenses) ? myExpenses : [])
      .reduce((n: number, e: any) => n + Number(e.amount || 0), 0);

    const teamRevenue = Object.values(revenueBy).reduce((a, b) => a + b, 0);
    const teamOrders = Object.values(ordersBy).reduce((a, b) => a + b, 0);
    const teamExpenses = Object.values(expenseBy).reduce((a, b) => a + b, 0);
    const teamSalary = canSeeSalary ? Object.values(salaryBy).reduce((a, b) => a + b, 0) : null;

    return NextResponse.json({
      isManager: true,
      today,
      month: today.slice(0, 7),
      canSeeSalary,
      totals: {
        // Split so a lead can see their own contribution against the team's,
        // rather than one blended figure that hides both.
        mine: { revenue: myRevenue, orders: myOrderCount, expenses: myExpenseTotal },
        team: { revenue: teamRevenue, orders: teamOrders, expenses: teamExpenses, salary: teamSalary },
        combined: {
          revenue: myRevenue + teamRevenue,
          orders: myOrderCount + teamOrders,
          expenses: myExpenseTotal + teamExpenses,
        },
        headcount: team.length,
      },
      pending: {
        leave: Array.isArray(pendingLeave) ? pendingLeave.length : 0,
        fixes: Array.isArray(pendingFixes) ? pendingFixes.length : 0,
      },
      team: (Array.isArray(people) ? people : []).map((e: any) => {
        const day = dayBy[e.id];
        const onLeave = leaveMap[e.id]?.[today];
        return {
          id: e.id,
          name: e.name,
          jobTitle: e.job_title || null,
          phone: e.phone || null,
          email: e.email || null,
          role: ROLE_LABEL[roleOf(e, org.employees, org.departments)],
          // What a manager actually wants at a glance: is this person working
          // today, and is anything wrong with the record?
          presence: onLeave ? "On leave"
            : day?.classification === "full" ? "In today"
            : day?.classification === "half" ? "Half day"
            : day?.classification === "weekly_off" ? "Day off"
            : day?.classification === "holiday" ? "Holiday"
            : day?.classification === "absent" ? "Not in"
            : "No record yet",
          hours: day ? (Number(day.worked_minutes || 0) / 60).toFixed(1) : null,
          flagged: !!day?.flagged,
          // This month's contribution.
          revenue: revenueBy[e.id] || 0,
          orders: ordersBy[e.id] || 0,
          expenses: expenseBy[e.id] || 0,
          salary: canSeeSalary ? (salaryBy[e.id] || 0) : null,
        };
      }),
    });
  } catch { return NextResponse.json({ error: "Couldn't load your team." }, { status: 500 }); }
}
