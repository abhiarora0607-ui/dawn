// app/api/team/workspace/route.ts
// One call that tells the portal WHO this person is, so the home can be
// assembled: migrated permissions, position in the real tree, department
// flavor, and the pending counts that drive widget order.
//
// Counts are fetched CONDITIONALLY BY CAPABILITY — no payroll query for
// someone who can't see payroll, no team queries for someone with no team.
// Everything runs in one Promise.all; there is no per-widget fetching
// (invariant 22's no-N+1 rule extends to this route).
//
// This endpoint is context, not authority: every action a widget leads to is
// still guarded by its own route. The floor needs no permission, so this
// route needs none either.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, hasPermission, effectivePermissions } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { approvedLeaveMap } from "@/lib/leave-db";
import { flavorOfDepartment, type WorkspaceCounts } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function istDate(): string {
  return new Date(new Date().getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const uid = ctx.uid;
  const meId = ctx.employeeId;

  try {
    const org = await loadOrg(url, key, uid, meId);
    const teamIds = org.myTeam.filter((id) => id !== meId);
    const isLead = teamIds.length > 0;
    const today = istDate();

    // Department flavor: order-only, so a lookup failure degrades to "none".
    let dept = "none" as ReturnType<typeof flavorOfDepartment>;
    try {
      const me = org.employees.find((e) => e.id === meId);
      const deptId = (me as any)?.department_id;
      if (deptId) {
        const d = await fetch(`${url}/rest/v1/departments?uid=eq.${uid}&id=eq.${deptId}&select=name&limit=1`,
          { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]);
        dept = flavorOfDepartment(d?.name);
      }
    } catch { dept = "none"; }

    // The scope an approver's counts cover: admins see the whole org's
    // pending, a lead sees their subtree — mirroring queue visibility.
    const approvalScope = org.isAdmin ? null : teamIds;   // null = all
    const scopeFilter = approvalScope === null ? "" : `&employee_id=in.(${approvalScope.join(",")})`;
    const canLeave = org.isAdmin || hasPermission(ctx, "leave_approve");
    const canAtt = org.isAdmin || hasPermission(ctx, "attendance_approve");
    const financeEyes = org.isAdmin || hasPermission(ctx, "expense_approve") || hasPermission(ctx, "payment_record");
    const canPayrollApprove = org.isAdmin || hasPermission(ctx, "payroll_approve");
    const wantTeam = isLead || org.isAdmin;

    const [pendingLeave, pendingFixes, leaveToday, presentToday, myPending, pendingSalary, pendingBonus, pendingExpense, draftSlips, prefsRow] = await Promise.all([
      // Actionable approvals: only counted if the permission is actually held —
      // the same gate canDecideWith enforces, so no widget ever shows a count
      // its holder can't act on.
      canLeave && (approvalScope === null || approvalScope.length > 0)
        ? fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&status=eq.pending&select=id${scopeFilter}`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      canAtt && (approvalScope === null || approvalScope.length > 0)
        ? fetch(`${url}/rest/v1/regularization_requests?uid=eq.${uid}&status=eq.pending&select=id${scopeFilter}`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      wantTeam && teamIds.length > 0
        ? approvedLeaveMap(url, key, uid, today, today).catch(() => ({}))
        : Promise.resolve({} as Record<string, unknown>),
      wantTeam && teamIds.length > 0
        ? fetch(`${url}/rest/v1/attendance_logs?uid=eq.${uid}&work_date=eq.${today}&employee_id=in.(${teamIds.join(",")})&select=employee_id`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&employee_id=eq.${meId}&status=eq.pending&select=id`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      financeEyes
        ? fetch(`${url}/rest/v1/salary_change_requests?uid=eq.${uid}&status=eq.pending&select=id,requested_by`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      org.isAdmin
        ? fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&status=eq.pending&select=id,requested_by`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      financeEyes
        ? fetch(`${url}/rest/v1/expense_requests?uid=eq.${uid}&status=eq.pending&employee_id=neq.${meId}&select=id`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      canPayrollApprove
        // full-scan: transient drafts count, id-only
        ? fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&status=eq.draft&select=id`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      fetch(`${url}/rest/v1/employee_accounts?uid=eq.${uid}&employee_id=eq.${meId}&select=prefs&limit=1`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const onLeaveSet = new Set(Object.keys(leaveToday || {}).filter((id) => teamIds.includes(id)));
    const presentSet = new Set((Array.isArray(presentToday) ? presentToday : []).map((r: any) => r.employee_id));

    const notMine = (rows: any) => (Array.isArray(rows) ? rows : []).filter((r: any) => !r.requested_by || r.requested_by !== meId).length;
    const counts: WorkspaceCounts = {
      actionableApprovals:
        (Array.isArray(pendingLeave) ? pendingLeave.length : 0) +
        (Array.isArray(pendingFixes) ? pendingFixes.length : 0) +
        notMine(pendingSalary) +
        notMine(pendingBonus) +
        (Array.isArray(pendingExpense) ? pendingExpense.length : 0),
      teamOnLeaveToday: onLeaveSet.size,
      teamPresentToday: presentSet.size,
      myPendingLeave: Array.isArray(myPending) ? myPending.length : 0,
      payrollDrafts: Array.isArray(draftSlips) ? draftSlips.length : 0,
      // People pulse (V54.1): computed from the org already in hand — the
      // loader now carries joining_date, so this costs zero extra queries.
      peopleJoiners: 0,
      peopleAnniversaries: 0,
    };
    {
      const now = new Date();
      const ym = now.toISOString().slice(0, 7);
      const mm = ym.slice(5, 7);
      const inScope = new Set(teamIds);
      for (const e of org.employees) {
        if (!inScope.has(e.id) || e.status === "inactive" || !e.joining_date) continue;
        const jd = String(e.joining_date);
        if (jd.slice(0, 7) === ym) counts.peopleJoiners++;
        else if (jd.slice(5, 7) === mm) counts.peopleAnniversaries++;
      }
    }

    return NextResponse.json({
      permissions: effectivePermissions(ctx),   // migrated — the client engine does plain includes
      isAdmin: org.isAdmin,
      isLead,
      teamSize: teamIds.length,
      dept,
      counts,
      prefs: (Array.isArray(prefsRow) && prefsRow[0]?.prefs && typeof prefsRow[0].prefs === "object") ? prefsRow[0].prefs : {},
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load your workspace." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (b.action !== "set_prefs") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    // Strings only, bounded, and "today" is stripped server-side too — the
    // floor can never be hidden, whatever a client sends.
    const clean = (v: any) => (Array.isArray(v) ? v.filter((x: any) => typeof x === "string").slice(0, 20) : []);
    const prefs = {
      hidden: clean(b.hidden).filter((id: string) => id !== "today"),
      pinned: clean(b.pinned).filter((id: string) => id !== "today"),
    };
    await fetch(`${url}/rest/v1/employee_accounts?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ prefs }),
    });
    return NextResponse.json({ ok: true, prefs });
  } catch {
    return NextResponse.json({ error: "Couldn't save your preferences." }, { status: 500 });
  }
}
