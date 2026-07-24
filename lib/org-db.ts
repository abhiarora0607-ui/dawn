import { H } from "@/lib/http";
// lib/org-db.ts
// Loads the org once per request and turns it into answers.
//
// Every scoped API route needs the same three things: the employee list, the
// departments, and who the caller is. Fetching those separately in 33 routes
// would be both slow and easy to get subtly wrong, so this assembles them once
// and hands back a small object that answers questions instead of exposing
// rows to be re-interpreted.

import {
  visibleEmployeeIds, canManage, canSee, roleOf, subtreeOf, managerChain,
  grantablePermissions, orgComplexity,
  type OrgEmployee, type Department, type OrgRole,
} from "@/lib/org";


export type OrgContext = {
  employees: OrgEmployee[];
  departments: Department[];
  me: OrgEmployee | null;
  role: OrgRole;
  isAdmin: boolean;
  /** Employee ids this person may see, or "all". */
  visible: string[] | "all";
  /** Ready-made PostgREST filter, so routes don't hand-roll one. */
  scopeFilter: (column?: string) => string;
  canSee: (targetId: string) => boolean;
  canManage: (targetId: string) => boolean;
  myTeam: string[];
  approverFor: (employeeId: string) => string | null;
  complexity: ReturnType<typeof orgComplexity>;
};

/**
 * Build the org context for a caller. `meId` is null for the owner, who is
 * outside the employee tree but above all of it.
 */
export async function loadOrg(
  url: string, key: string, uid: string, meId: string | null,
): Promise<OrgContext> {
  const [empRows, deptRows] = await Promise.all([
    fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,reports_to,department_id,is_owner,is_admin,status,job_title,joining_date&order=name.asc`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/departments?uid=eq.${uid}&select=id,name,head_employee_id&order=sort_order.asc`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ]);

  const employees: OrgEmployee[] = Array.isArray(empRows) ? empRows : [];
  const departments: Department[] = Array.isArray(deptRows) ? deptRows : [];

  // The owner signs in as the business rather than as an employee, so there
  // may be no employee row for them. Treat that as full authority.
  const me = meId ? employees.find((e) => e.id === meId) || null : null;
  const isAdmin = !meId || !!me?.is_owner || !!me?.is_admin;
  const role: OrgRole = me ? roleOf(me, employees, departments) : "owner";

  const visible: string[] | "all" = me ? visibleEmployeeIds(me, employees, departments) : "all";
  const myTeam = me ? subtreeOf(me.id, employees) : employees.map((e) => e.id);

  return {
    employees, departments, me, role, isAdmin, visible, myTeam,
    complexity: orgComplexity(employees.filter((e) => e.status !== "inactive").length),

    /**
     * A PostgREST filter for the caller's scope. Returns "" for unrestricted
     * access — callers append it directly, so an empty string is a no-op
     * rather than something that needs branching around.
     */
    scopeFilter(column = "employee_id") {
      if (visible === "all") return "";
      if (visible.length === 0) return `&${column}=eq.00000000-0000-0000-0000-000000000000`;
      return `&${column}=in.(${visible.join(",")})`;
    },

    canSee(targetId: string) {
      if (!me) return true;
      return canSee(me, targetId, employees, departments);
    },

    canManage(targetId: string) {
      if (!me) return true;
      return canManage(me, targetId, employees);
    },

    /**
     * Who decides this person's requests. The nearest manager — and never the
     * applicant, so a lead's own leave rises to their lead rather than landing
     * back in their own queue.
     */
    approverFor(employeeId: string) {
      const chain = managerChain(employeeId, employees);
      return chain[0] || null;
    },
  };
}

/** What this caller may hand to someone else. */
export function grantableFor(ctx: OrgContext, myPermissions: string[], allPermissions: string[]): string[] {
  return grantablePermissions(myPermissions, ctx.isAdmin, allPermissions);
}

/** Employees the caller may see, with the fields a directory needs. */
export function visibleEmployeeRows(ctx: OrgContext): OrgEmployee[] {
  if (ctx.visible === "all") return ctx.employees;
  const set = new Set(ctx.visible);
  return ctx.employees.filter((e) => set.has(e.id));
}
