// lib/org.ts
// The org structure: who reports to whom, and therefore who can see what.
//
// Everything in V38 rests on this file. Before it, "an employee sees their own
// records" was written out by hand in 33 different places. That was fine while
// the answer was always "just me", but a hierarchy makes the answer a
// computation — and 33 copies of a computation is 33 chances to leak one
// person's salary to another.
//
// Three ideas do all the work:
//
//   1. ROLE IS DERIVED, NEVER STORED. If you have reports, you are a lead. If
//      you head a department, you are a dept head. Storing role alongside the
//      tree lets them disagree, and then you get "leads" who manage nobody and
//      members who somehow have reports.
//
//   2. VISIBILITY IS THE SUBTREE. A lead sees everyone beneath them at every
//      depth, not just direct reports. A manager two levels up is still
//      accountable for the people two levels down.
//
//   3. YOU CANNOT GRANT WHAT YOU DO NOT HOLD. Delegation is always a subset.
//      This is what stops authority growing as it travels down a chain.

export type OrgRole = "owner" | "admin" | "dept_head" | "lead" | "member";

export type OrgEmployee = {
  id: string;
  name: string;
  reports_to: string | null;
  department_id: string | null;
  is_owner?: boolean;
  is_admin?: boolean;
  status?: string;
  job_title?: string | null;
};

export type Department = { id: string; name: string; head_employee_id: string | null };

/** Permissions that exist but can never be handed down, whoever holds them. */
export const NEVER_DELEGATED = ["salary_edit", "billing"] as const;

/** Org-level permissions layered on top of the existing CRM permission list. */
export const ORG_PERMISSIONS = [
  "salary_view",     // see a report's pay — grantable by admin
  "salary_edit",     // change it — admin only, never delegated
  "bonus_request",   // propose a bonus; approval still required
  "payroll_pay",     // mark a payslip paid (V39). A permission, not a role,
                     // because at two people this is the owner and at two
                     // hundred it's a finance clerk.
  "team_view",       // see your reports' records
  "team_edit",       // edit them
  "org_manage",      // departments, reporting lines
] as const;

export const ORG_PERMISSION_LABELS: Record<string, string> = {
  salary_view: "See salaries",
  salary_edit: "Change salaries",
  bonus_request: "Propose bonuses",
  payroll_pay: "Mark payslips paid",
  team_view: "See my team's records",
  team_edit: "Edit my team's records",
  org_manage: "Manage departments & reporting lines",
};

// ---------------------------------------------------------------- the tree

/** Direct reports, indexed by manager. Built once per request. */
export function childrenOf(employees: OrgEmployee[]): Record<string, OrgEmployee[]> {
  const out: Record<string, OrgEmployee[]> = {};
  for (const e of employees) {
    if (!e.reports_to) continue;
    (out[e.reports_to] ||= []).push(e);
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Everyone beneath a person, at any depth, excluding themselves.
 *
 * The visited set is not defensive tidiness — a reporting cycle would loop
 * forever, and this function runs on every authenticated request. The
 * application rejects cycles at write time; this makes a bad row survivable
 * rather than fatal.
 */
export function subtreeOf(rootId: string, employees: OrgEmployee[]): string[] {
  const kids = childrenOf(employees);
  const out: string[] = [];
  const seen = new Set<string>([rootId]);
  const stack = [...(kids[rootId] || [])];
  while (stack.length) {
    const e = stack.pop()!;
    if (seen.has(e.id)) continue;      // cycle guard
    seen.add(e.id);
    out.push(e.id);
    for (const c of kids[e.id] || []) stack.push(c);
  }
  return out;
}

/** The chain upward, nearest manager first. Used to route approvals. */
export function managerChain(employeeId: string, employees: OrgEmployee[]): string[] {
  const byId: Record<string, OrgEmployee> = {};
  for (const e of employees) byId[e.id] = e;
  const chain: string[] = [];
  const seen = new Set<string>([employeeId]);
  let cur = byId[employeeId]?.reports_to || null;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    cur = byId[cur]?.reports_to || null;
  }
  return chain;
}

/**
 * Would setting `managerId` as this person's manager create a loop?
 * Rejected at write time so the tree can always be walked.
 */
export function wouldCycle(employeeId: string, managerId: string, employees: OrgEmployee[]): boolean {
  if (employeeId === managerId) return true;
  return managerChain(managerId, employees).includes(employeeId) ||
         subtreeOf(employeeId, employees).includes(managerId);
}

// ---------------------------------------------------------------- the role

/**
 * What someone *is*, worked out from where they sit. Never read from a column.
 */
export function roleOf(emp: OrgEmployee, employees: OrgEmployee[], departments: Department[]): OrgRole {
  if (emp.is_owner) return "owner";
  if (emp.is_admin) return "admin";
  if (departments.some((d) => d.head_employee_id === emp.id)) return "dept_head";
  if (employees.some((e) => e.reports_to === emp.id && e.status !== "inactive")) return "lead";
  return "member";
}

export const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  dept_head: "Department head",
  lead: "Team lead",
  member: "Member",
};

// ------------------------------------------------------------ the scope

/**
 * Which employees this person may see. The union of two claims:
 *
 *   · the department they head, if any
 *   · everyone beneath them in the tree
 *
 * A union rather than a precedence order, because someone can legitimately be
 * both — a department head who also has direct reports outside it. Taking the
 * larger of the two would be wrong in one direction and taking the smaller
 * wrong in the other.
 */
export function visibleEmployeeIds(
  me: OrgEmployee, employees: OrgEmployee[], departments: Department[],
): string[] | "all" {
  if (me.is_owner || me.is_admin) return "all";

  const ids = new Set<string>([me.id]);

  for (const d of departments) {
    if (d.head_employee_id === me.id) {
      for (const e of employees) if (e.department_id === d.id) ids.add(e.id);
    }
  }
  for (const id of subtreeOf(me.id, employees)) ids.add(id);

  return [...ids];
}

/** Convenience: may `me` see this specific person's records? */
export function canSee(
  me: OrgEmployee, targetId: string, employees: OrgEmployee[], departments: Department[],
): boolean {
  const v = visibleEmployeeIds(me, employees, departments);
  return v === "all" || v.includes(targetId);
}

/**
 * May `me` *edit* this person? Seeing and editing are different: a department
 * head may see everyone in their department while only being accountable for
 * their own reports. Editing requires the person to be genuinely beneath you.
 */
export function canManage(
  me: OrgEmployee, targetId: string, employees: OrgEmployee[],
): boolean {
  if (me.is_owner || me.is_admin) return true;
  if (targetId === me.id) return false;              // nobody edits their own permissions
  return subtreeOf(me.id, employees).includes(targetId);
}

// ------------------------------------------------------- delegating access

/**
 * What `me` is allowed to hand to someone else: their own permissions, minus
 * the ones nobody may pass on. Admins hold everything, so admins may grant
 * everything except the permanently reserved ones.
 *
 * This is the rule that stops authority inflating as it moves down a chain —
 * without it, a lead could grant a permission they were never given.
 */
export function grantablePermissions(myPermissions: string[], isAdmin: boolean, allPermissions: string[]): string[] {
  const pool = isAdmin ? allPermissions : myPermissions;
  return pool.filter((p) => !(NEVER_DELEGATED as readonly string[]).includes(p));
}

/**
 * Revoking a permission from a manager must remove it from everyone they gave
 * it to. Permissions that outlive the authority which created them are how
 * these systems quietly rot: someone leaves a role, keeps the access, and
 * nobody notices for a year.
 */
export function cascadeRevoke(
  managerId: string, revoked: string[], employees: OrgEmployee[],
  accounts: { employee_id: string; permissions: string[]; granted_by?: string | null }[],
): { employee_id: string; permissions: string[] }[] {
  if (revoked.length === 0) return [];
  const below = new Set(subtreeOf(managerId, employees));
  const out: { employee_id: string; permissions: string[] }[] = [];

  for (const acc of accounts) {
    if (!below.has(acc.employee_id)) continue;
    if (acc.granted_by && acc.granted_by !== managerId) continue;   // someone else's grant stands
    const kept = (acc.permissions || []).filter((p) => !revoked.includes(p));
    if (kept.length !== (acc.permissions || []).length) {
      out.push({ employee_id: acc.employee_id, permissions: kept });
    }
  }
  return out;
}

// ------------------------------------------------------------- disclosure

/**
 * How much org machinery to show. A one-person business should never meet the
 * word "department"; a 200-person business needs all of it. Same schema, shown
 * progressively — this is what lets one product serve both ends.
 */
export function orgComplexity(employeeCount: number): {
  showDepartments: boolean; showReportsTo: boolean; showOrgTree: boolean;
} {
  return {
    showReportsTo: employeeCount >= 3,     // meaningless with one manager and one report
    showDepartments: employeeCount >= 5,
    showOrgTree: employeeCount >= 3,
  };
}
