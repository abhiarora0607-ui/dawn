// app/api/view-as/route.ts
// Seeing the portal as one of your people sees it.
//
// This is deliberately NOT impersonation. Nothing here can write, and no
// session is issued — the owner asks "what does Priya see?" and gets a
// read-only snapshot. Real impersonation, where actions are recorded as
// someone else's, is a liability: an audit trail that says a person did
// something they didn't do is worse than no audit trail at all.
//
// Every use is logged, because looking at someone's pay and attendance is a
// thing that should leave a trace even when it's legitimate.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { loadOrg } from "@/lib/org-db";
import { istDate } from "@/lib/attendance";
import { getBalances, getLeaveTypes } from "@/lib/leave-db";
import { LEAVE_LABEL } from "@/lib/leave";
import { roleOf, ROLE_LABEL } from "@/lib/org";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET(req: Request) {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const area = await requireArea(url, key, uid, "crm");
  if (area) return NextResponse.json(area, { status: 403 });

  const employeeId = new URL(req.url).searchParams.get("employeeId");
  if (!employeeId) return NextResponse.json({ error: "Who do you want to look at?" }, { status: 400 });

  const org = await loadOrg(url, key, uid, null);
  const emp = org.employees.find((e) => e.id === employeeId);
  if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  const today = istDate();
  const month = today.slice(0, 7);

  const [full, account, days, leaveReqs, payslips] = await Promise.all([
    fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${employeeId}&select=*&limit=1`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null),
    fetch(`${url}/rest/v1/employee_accounts?uid=eq.${uid}&employee_id=eq.${employeeId}&select=permissions,login_id&limit=1`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null),
    fetch(`${url}/rest/v1/attendance_days?uid=eq.${uid}&employee_id=eq.${employeeId}&work_date=gte.${month}-01&select=work_date,classification,worked_minutes,flagged&order=work_date.desc&limit=31`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&employee_id=eq.${employeeId}&select=*&order=from_date.desc&limit=10`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&employee_id=eq.${employeeId}&select=month,status,net_amount&order=month.desc&limit=6`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ]);

  const types = await getLeaveTypes(url, key, uid);
  const balances = await getBalances(url, key, uid, employeeId, Number(today.slice(0, 4)), types);

  // Looking at someone's record is itself an action worth recording.
  await audit({ uid, action: "view_as", entity: "employees", entityId: employeeId, meta: { name: emp.name } });

  const D = Array.isArray(days) ? days : [];

  return NextResponse.json({
    employee: {
      id: emp.id,
      name: emp.name,
      jobTitle: full?.job_title || null,
      role: ROLE_LABEL[roleOf(emp, org.employees, org.departments)],
      department: org.departments.find((d) => d.id === emp.department_id)?.name || null,
      manager: org.employees.find((e) => e.id === emp.reports_to)?.name || null,
      phone: full?.phone || null,
      email: full?.email || null,
      joiningDate: full?.joining_date || null,
      salary: Number(full?.monthly_salary || 0),
      hasLogin: !!account?.login_id,
      permissions: account?.permissions || [],
    },
    // The tabs this person would actually see, which is the question an owner
    // is usually asking when they wonder why someone can't find something.
    visibleTabs: (account?.permissions || []).length
      ? ["Home", "Attendance", "Leave", "My Pay", "People"]
        .concat(org.employees.some((e) => e.reports_to === employeeId) ? ["My Team"] : [])
      : [],
    thisMonth: {
      present: D.filter((d: any) => d.classification === "full").length,
      half: D.filter((d: any) => d.classification === "half").length,
      absent: D.filter((d: any) => d.classification === "absent").length,
      flagged: D.filter((d: any) => d.flagged).length,
      hours: (D.reduce((n: number, d: any) => n + Number(d.worked_minutes || 0), 0) / 60).toFixed(1),
    },
    balances: balances.filter((b) => !b.infinite).map((b) => ({ label: LEAVE_LABEL[b.code], available: b.available })),
    recentLeave: (Array.isArray(leaveReqs) ? leaveReqs : []).map((r: any) => ({
      id: r.id, label: LEAVE_LABEL[r.code] || r.code, from: r.from_date, to: r.to_date, days: r.days, status: r.status,
    })),
    payslips: (Array.isArray(payslips) ? payslips : []).map((p: any) => ({
      month: p.month, status: p.status, net: Number(p.net_amount || 0),
    })),
  });
}
