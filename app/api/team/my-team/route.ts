// app/api/team/my-team/route.ts
// A manager's view of their own people, inside the employee portal.
//
// Everything here is scoped through the org tree rather than trusted from the
// request — a manager asking about someone who isn't theirs gets nothing, not
// an error message confirming that person exists.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
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
    const [people, days, leaveMap, pendingLeave, pendingFixes] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${ctx.uid}&id=in.(${team.join(",")})&select=id,name,job_title,phone,email,status&order=name.asc`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/attendance_days?uid=eq.${ctx.uid}&work_date=eq.${today}&employee_id=in.(${team.join(",")})&select=employee_id,classification,worked_minutes,flagged`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      approvedLeaveMap(url, key, ctx.uid, today, today),
      fetch(`${url}/rest/v1/leave_requests?uid=eq.${ctx.uid}&status=eq.pending&employee_id=in.(${team.join(",")})&select=id`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/regularization_requests?uid=eq.${ctx.uid}&status=eq.pending&employee_id=in.(${team.join(",")})&select=id`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const dayBy: Record<string, any> = {};
    for (const d of Array.isArray(days) ? days : []) dayBy[d.employee_id] = d;

    return NextResponse.json({
      isManager: true,
      today,
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
        };
      }),
    });
  } catch { return NextResponse.json({ error: "Couldn't load your team." }, { status: 500 }); }
}
