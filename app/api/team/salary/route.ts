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
    const [empRows, expenses, encashments] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=eq.${ctx.employeeId}&select=name,monthly_salary,joining_date,job_title&limit=1`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()),
      // Salary rows the cron posted for this person.
      fetch(`${url}/rest/v1/expenses?uid=eq.${ctx.uid}&source=eq.salary&source_id=eq.${ctx.employeeId}&deleted_at=is.null&select=id,date,amount,note&order=date.desc&limit=24`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/encashment_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&order=created_at.desc&limit=12`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const emp = Array.isArray(empRows) ? empRows[0] : null;
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    const monthly = Number(emp.monthly_salary || 0);

    return NextResponse.json({
      name: emp.name,
      jobTitle: emp.job_title || null,
      joiningDate: emp.joining_date || null,
      monthly,
      perDay: Math.round((monthly / 30) * 100) / 100,
      payments: (Array.isArray(expenses) ? expenses : []).map((x: any) => ({
        id: x.id,
        date: x.date,
        amount: Number(x.amount || 0),
        // The cron writes encashment into the note, so an employee can see why
        // a month was larger than usual without needing a separate statement.
        note: x.note || null,
        hasExtra: /encashment/i.test(x.note || ""),
      })),
      encashments: (Array.isArray(encashments) ? encashments : []).map((e: any) => ({
        id: e.id, days: e.days, amount: e.amount, status: e.status,
        label: LEAVE_LABEL[e.code] || e.code, paidInMonth: e.paid_in_month,
      })),
    });
  } catch { return NextResponse.json({ error: "Couldn't load your pay." }, { status: 500 }); }
}
