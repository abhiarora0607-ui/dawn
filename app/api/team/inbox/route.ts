// app/api/team/inbox/route.ts
// Every pending decision in one place: leave, attendance fixes, salary
// proposals, bonuses. Before V52 these lived on three different screens
// (leave in My Team, salary on the owner's employees page, bonuses on
// payroll) — the engine was unified in V48b, the front door wasn't.
//
// Authority is DELEGATED, never invented here: actionableFor() routes each
// kind through canDecideWith / canApproveSalaryChange / the admin rule — the
// same functions the deciding routes enforce. Visibility follows the V48b
// rule: a request stays visible to the chain it climbed past, greyed, with
// the name of whose queue it actually landed in — nothing vanishes.
//
// Everything loads in one Promise.all, scoped by capability (a plain member
// costs two small queries; invariant 22's no-N+1 rule applies).

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, effectivePermissions } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { escalateApprover, type ApprovalContext } from "@/lib/approvals";
import { canEditSalaryDirectly } from "@/lib/salary-authority";
import { actionableFor, sortInbox, type InboxItem } from "@/lib/inbox";
import { migratePermissions } from "@/lib/permissions";
import { LEAVE_LABEL } from "@/lib/leave";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const uid = ctx.uid;
  const meId = ctx.employeeId;

  try {
    const org = await loadOrg(url, key, uid, meId);
    const perms = effectivePermissions(ctx);
    const appr: ApprovalContext = { uid, url, key, meId, permissions: perms, isAdmin: org.isAdmin, org } as any;

    const nameById: Record<string, string> = {};
    for (const e of org.employees) nameById[e.id] = e.name;

    // Whose requests this viewer can SEE (tree visibility; action is separate).
    const visibleIds = (org.isAdmin ? org.employees.map((e) => e.id) : org.myTeam)
      .filter((id) => id !== meId);
    const seesTeam = visibleIds.length > 0;
    const scope = `&employee_id=in.(${visibleIds.join(",")})`;
    const financeEyes = canEditSalaryDirectly({ isAdmin: org.isAdmin, permissions: perms });

    const [leaveRows, fixRows, salaryRows, mySalaryRows, bonusRows, myBonusRows, expenseRows, myExpenseRows, acctRows] = await Promise.all([
      seesTeam
        ? fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&status=eq.pending&select=*${scope}`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      seesTeam
        ? fetch(`${url}/rest/v1/regularization_requests?uid=eq.${uid}&status=eq.pending&select=*${scope}`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      financeEyes
        ? fetch(`${url}/rest/v1/salary_change_requests?uid=eq.${uid}&status=eq.pending&select=*`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      // The proposer watches their own proposal's journey even without
      // finance eyes — visibility, not authority.
      meId && !financeEyes
        ? fetch(`${url}/rest/v1/salary_change_requests?uid=eq.${uid}&status=eq.pending&requested_by=eq.${meId}&select=*`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      org.isAdmin
        ? fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&status=eq.pending&select=*`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      meId && !org.isAdmin
        ? fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&status=eq.pending&requested_by=eq.${meId}&select=*`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      financeEyes
        ? fetch(`${url}/rest/v1/expense_requests?uid=eq.${uid}&status=eq.pending&select=*`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      meId && !financeEyes
        ? fetch(`${url}/rest/v1/expense_requests?uid=eq.${uid}&status=eq.pending&employee_id=eq.${meId}&select=*`,
            { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
        : Promise.resolve([]),
      // Everyone's permissions, once — for the escalation walk and the
      // admin's inert-authority review.
      fetch(`${url}/rest/v1/employee_accounts?uid=eq.${uid}&select=employee_id,permissions`,
        { headers: empHeaders(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const permsByEmp: Record<string, string[]> = {};
    for (const a of Array.isArray(acctRows) ? acctRows : []) {
      permsByEmp[a.employee_id] = migratePermissions(Array.isArray(a.permissions) ? a.permissions : []);
    }
    const permsOf = (id: string) => permsByEmp[id] || [];
    const landedWith = (subjectId: string, perm: string): string => {
      const { approverId } = escalateApprover(subjectId, org.employees as any, permsOf, perm);
      return (approverId && nameById[approverId]) || "the admin";
    };

    const items: InboxItem[] = [];

    for (const r of Array.isArray(leaveRows) ? leaveRows : []) {
      if (r.employee_id === meId) continue;    // own requests live in My Leave
      const actionable = actionableFor("leave", appr, r.employee_id, null);
      items.push({
        kind: "leave", id: r.id, employeeId: r.employee_id,
        employeeName: nameById[r.employee_id] || "Unknown",
        title: `${nameById[r.employee_id] || "Someone"} · ${r.days} ${Number(r.days) === 1 ? "day" : "days"} ${LEAVE_LABEL[r.code] || r.code}`,
        sub: [r.from_date === r.to_date ? r.from_date : `${r.from_date} → ${r.to_date}`, r.reason].filter(Boolean).join(" · "),
        createdAt: r.created_at || r.from_date || "",
        actionable,
        withName: actionable ? undefined : landedWith(r.employee_id, "leave_approve"),
      });
    }

    for (const r of Array.isArray(fixRows) ? fixRows : []) {
      if (r.employee_id === meId) continue;
      const actionable = actionableFor("fix", appr, r.employee_id, null);
      items.push({
        kind: "fix", id: r.id, employeeId: r.employee_id,
        employeeName: nameById[r.employee_id] || "Unknown",
        title: `${nameById[r.employee_id] || "Someone"} · attendance fix for ${r.work_date}`,
        sub: r.reason || "Missed or wrong punch",
        createdAt: r.created_at || r.work_date || "",
        actionable,
        withName: actionable ? undefined : landedWith(r.employee_id, "attendance_approve"),
      });
    }

    for (const r of [...(Array.isArray(salaryRows) ? salaryRows : []), ...(Array.isArray(mySalaryRows) ? mySalaryRows : [])]) {
      const actionable = actionableFor("salary", appr, r.employee_id, r.requested_by || null);
      items.push({
        kind: "salary", id: r.id, employeeId: r.employee_id,
        employeeName: nameById[r.employee_id] || "Unknown",
        title: `Salary change · ${nameById[r.employee_id] || "Someone"}`,
        sub: `₹${Number(r.current_salary || 0).toLocaleString("en-IN")} → ₹${Number(r.proposed_salary).toLocaleString("en-IN")} · by ${nameById[r.requested_by] || "a lead"}${r.reason ? ` · ${r.reason}` : ""}`,
        createdAt: r.created_at || "",
        actionable,
        withName: actionable ? undefined : "Finance",
        mine: r.requested_by === meId,
      });
    }

    for (const r of [...(Array.isArray(bonusRows) ? bonusRows : []), ...(Array.isArray(myBonusRows) ? myBonusRows : [])]) {
      const actionable = actionableFor("bonus", appr, r.employee_id, r.requested_by || null);
      items.push({
        kind: "bonus", id: r.id, employeeId: r.employee_id,
        employeeName: nameById[r.employee_id] || "Unknown",
        title: `Bonus · ₹${Number(r.amount).toLocaleString("en-IN")} for ${nameById[r.employee_id] || "someone"}`,
        sub: `${r.reason || "No reason given"} · by ${nameById[r.requested_by] || "a lead"}`,
        createdAt: r.created_at || "",
        actionable,
        withName: actionable ? undefined : "the admin",
        mine: r.requested_by === meId,
      });
    }

    for (const r of [...(Array.isArray(expenseRows) ? expenseRows : []), ...(Array.isArray(myExpenseRows) ? myExpenseRows : [])]) {
      const actionable = actionableFor("expense", appr, r.employee_id, r.employee_id);
      items.push({
        kind: "expense", id: r.id, employeeId: r.employee_id,
        employeeName: nameById[r.employee_id] || "Unknown",
        title: `Expense · ₹${Number(r.amount).toLocaleString("en-IN")} ${r.category} · ${nameById[r.employee_id] || "someone"}`,
        sub: [r.expense_date, r.note, r.receipt_url ? "receipt attached" : ""].filter(Boolean).join(" · "),
        createdAt: r.created_at || "",
        actionable,
        withName: actionable ? undefined : "Finance",
        mine: r.employee_id === meId,
      });
    }

    // Admin-only: authority that can act on nobody — a permission held by
    // someone with no reports is inert under line-management rules. Surfaced
    // for review, not silently stranded (and not auto-"fixed": changing who
    // approves is a deliberate decision, not a side effect).
    let review: { name: string; permission: string }[] = [];
    if (org.isAdmin) {
      for (const e of org.employees) {
        if (e.status === "inactive" || e.is_admin || e.is_owner) continue;
        const hasReports = org.employees.some((x) => x.reports_to === e.id && x.status !== "inactive");
        if (hasReports) continue;
        for (const p of ["leave_approve", "attendance_approve"]) {
          if (permsOf(e.id).includes(p)) review.push({ name: e.name, permission: p });
        }
      }
    }

    const sorted = sortInbox(items);
    return NextResponse.json({
      items: sorted,
      counts: {
        actionable: sorted.filter((i) => i.actionable).length,
        watching: sorted.filter((i) => !i.actionable).length,
      },
      review,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load your inbox." }, { status: 500 });
  }
}
