// app/api/team/salary/route.ts
// An employee's own pay.
//
// Read-only, and scoped to the caller with no parameters — there is no way to
// ask this endpoint about somebody else, which is the simplest defence against
// the worst leak in an HR product.
//
// Until V39 introduces payslips as real documents, this reads the salary
// expenses the overnight cron already posts. That has a useful property: what
// an employee sees is exactly what the business recorded paying, rather than a
// separate number that could drift from the books.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { LEAVE_LABEL } from "@/lib/leave";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;

  try {
    const [empRows, slips, encashments] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=name,monthly_salary,joining_date,job_title&limit=1`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      // The payslips themselves — approved or paid only. A draft is a working
      // document and showing it would promise money nobody has agreed to yet.
      fetch(`${url}/rest/v1/payslips?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&status=in.(approved,paid)&select=*&order=month.desc&limit=24`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/encashment_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&order=created_at.desc&limit=12`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const emp = Array.isArray(empRows) ? empRows[0] : null;
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const monthly = Number(emp.monthly_salary || 0);

    // The lines are what answer "why was last month different?" without the
    // employee having to ask anyone.
    const S = Array.isArray(slips) ? slips : [];
    let linesBySlip: Record<string, any[]> = {};
    if (S.length) {
      const rows = await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${ctx.uid}&payslip_id=in.(${S.map((s: any) => s.id).join(",")})&select=payslip_id,kind,label,amount`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      for (const l of Array.isArray(rows) ? rows : []) (linesBySlip[l.payslip_id] ||= []).push(l);
    }

    return NextResponse.json({
      name: emp.name,
      jobTitle: emp.job_title || null,
      joiningDate: emp.joining_date || null,
      monthly,
      perDay: Math.round((monthly / 30) * 100) / 100,
      payslips: (Array.isArray(slips) ? slips : []).map((x: any) => ({
        id: x.id,
        month: x.month,
        status: x.status,
        base: Number(x.base_amount || 0),
        additions: Number(x.additions || 0),
        deductions: Number(x.deductions || 0),
        net: Number(x.net_amount || 0),
        paidAt: x.paid_at,
        lines: linesBySlip[x.id] || [],
      })),
      encashments: (Array.isArray(encashments) ? encashments : []).map((e: any) => ({
        id: e.id, days: e.days, amount: e.amount, status: e.status,
        label: LEAVE_LABEL[e.code] || e.code, paidInMonth: e.paid_in_month,
      })),
    });
  } catch { return NextResponse.json({ error: "Couldn't load your pay." }, { status: 500 }); }
}
