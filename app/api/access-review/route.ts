// app/api/access-review/route.ts
// A single screen answering "who can do what, and where do requests go?"
//
// Access built up one grant at a time becomes impossible to reason about — who
// can approve leave, who can see salaries, whose requests pile up on whom.
// This computes the whole picture at once: every person, what they hold, and —
// using the same escalation walk the approval routes use — where each person's
// leave request actually lands.
//
// Owner-only, since it exposes everyone's access at once.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { escalateApprover } from "@/lib/approvals";
import { PERMISSIONS, PORTAL_PERMISSIONS } from "@/lib/permissions";
import { migratePermissions } from "@/lib/permissions";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  try {
    const [emps, accounts] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,reports_to,is_owner,is_admin,job_title,status&order=name.asc`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/employee_accounts?uid=eq.${uid}&select=employee_id,permissions,active`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const employees = Array.isArray(emps) ? emps : [];
    const permByEmp: Record<string, string[]> = {};
    for (const a of Array.isArray(accounts) ? accounts : []) {
      // Migrate stored permissions so old vocabulary resolves to current names.
      permByEmp[a.employee_id] = migratePermissions(a.permissions || []);
    }
    const permsOf = (id: string) => permByEmp[id] || [];
    const nameById: Record<string, string> = {};
    for (const e of employees) nameById[e.id] = e.name;

    // For each person: what they hold, and where their leave request lands.
    const rows = employees
      .filter((e: any) => !e.is_owner)
      .map((e: any) => {
        const held = permsOf(e.id);
        const leaveLandsOn = escalateApprover(e.id, employees, permsOf, "leave_approve");
        const approverName = leaveLandsOn.approverId
          ? (nameById[leaveLandsOn.approverId] || "the owner")
          : "the owner";
        return {
          id: e.id,
          name: e.name,
          jobTitle: e.job_title || null,
          isAdmin: !!e.is_admin,
          active: (Array.isArray(accounts) ? accounts : []).find((a: any) => a.employee_id === e.id)?.active ?? false,
          // Only portal-grantable permissions are worth showing here.
          permissions: held.filter((p) => PORTAL_PERMISSIONS.includes(p)),
          canApproveLeave: e.is_admin || held.includes("leave_approve"),
          canApproveAttendance: e.is_admin || held.includes("attendance_approve"),
          leaveApprover: approverName,
        };
      });

    // Which permissions nobody holds — candidates to stop offering, or gaps.
    const grantedSomewhere = new Set<string>();
    for (const held of Object.values(permByEmp)) for (const p of held) grantedSomewhere.add(p);
    const unusedPermissions = PORTAL_PERMISSIONS.filter((p) => !grantedSomewhere.has(p));

    return NextResponse.json({
      people: rows,
      unusedPermissions: unusedPermissions.map((id) => ({
        id, label: PERMISSIONS.find((p) => p.id === id)?.label || id,
      })),
      totalPortalPermissions: PORTAL_PERMISSIONS.length,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't build the access review." }, { status: 500 });
  }
}
