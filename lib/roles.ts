// lib/roles.ts
// Job roles: the dropdown.
//
// Roles here are JOB FUNCTIONS — the words a business already uses for the work
// — not access tiers. "Accountant" and "Sales Representative" are things people
// call themselves; "Level 2" and "Power User" are things software invents, and
// nobody can tell you what they mean without opening a table.
//
// Two design decisions worth stating, because both are easy to get wrong:
//
//   1. A ROLE IS A TEMPLATE, NOT A CAGE. Selecting one applies a permission set
//      you can then adjust. The alternative — roles as fixed bundles — forces a
//      new role for every variation ("Sales Rep who can also see expenses"),
//      and you arrive at forty roles that are really just permission lists with
//      names. That defeats the point of having roles at all.
//
//   2. ROLE IS NOT HIERARCHY. V38 derives standing from the reporting tree:
//      having reports makes you a lead. This is separate and answers a different
//      question — a Finance Manager may report to the owner and manage nobody.
//      Conflating them is how you end up unable to express a senior specialist.

import { expandImplied, PERMISSION_IDS } from "@/lib/permissions";

export type RoleId =
  | "owner" | "administrator" | "manager" | "hr_manager" | "finance_manager"
  | "accountant" | "sales_rep" | "support_staff" | "custom";

export type RoleDef = {
  id: RoleId;
  label: string;
  /** What this person does, in the words a business owner would use. */
  description: string;
  permissions: string[];
  /** Assigned by the system rather than chosen from the dropdown. */
  systemOnly?: boolean;
};

// Building blocks. Roles share these so a change to "what a manager can do"
// happens once rather than in five places.
const PORTAL = ["dashboard", "settings", "people_directory"];
const DAILY = ["tasks", "calendar", "notes"];
const CRM_READ = ["leads", "customers", "orders", "catalogue"];
const CRM_WRITE = ["leads_edit", "customers_edit", "orders_edit"];
const MANAGES_PEOPLE = ["team_view", "team_edit", "leave_approve", "attendance_approve", "org_view"];

export const ROLES: RoleDef[] = [
  {
    id: "owner",
    label: "Owner",
    description: "Runs the business. Holds everything, including billing.",
    permissions: [...PERMISSION_IDS],
    systemOnly: true,
  },
  {
    id: "administrator",
    label: "Administrator",
    description: "Runs the system day to day — people, access and settings, but not billing.",
    permissions: [
      ...PORTAL, ...DAILY, ...CRM_READ, ...CRM_WRITE, ...MANAGES_PEOPLE,
      "messaging", "reports", "finance_view", "expense_view", "expense_create",
      "employee_view", "employee_edit", "org_manage", "access_manage",
      "business_settings", "salary_view", "bonus_approve", "data_export",
      "contacts_delete", "orders_cancel", "catalogue_edit",
    ],
  },
  {
    id: "manager",
    label: "Manager",
    description: "Leads a team. Approves their leave and attendance, sees their work.",
    permissions: [
      ...PORTAL, ...DAILY, ...CRM_READ, ...CRM_WRITE, ...MANAGES_PEOPLE,
      "messaging", "reports", "bonus_request",
    ],
  },
  {
    id: "hr_manager",
    label: "HR Manager",
    description: "Looks after people — records, leave, attendance and hiring. Not the money.",
    permissions: [
      ...PORTAL, ...DAILY, ...MANAGES_PEOPLE,
      "employee_view", "employee_edit", "org_view", "org_manage",
      "leave_approve", "attendance_approve", "access_manage",
      // Deliberately NOT salary_edit or payroll_pay. HR sets up people;
      // finance moves money. Merging the two is the single most common way a
      // small business ends up with one person able to create an employee and
      // pay them.
      "salary_view",
    ],
  },
  {
    id: "finance_manager",
    label: "Finance Manager",
    description: "Owns the money. Approves expenses and payroll — someone else drafts and releases it.",
    permissions: [
      ...PORTAL, ...DAILY,
      "finance_view", "expense_view", "expense_approve", "payment_record",
      "reports", "data_export", "orders", "catalogue",
      "salary_view", "payroll_approve", "bonus_approve",
      // Deliberately NOT payroll_prepare and NOT payroll_pay.
      //
      // Approving what you drafted yourself defeats the check. And approving
      // then releasing the money is the same person on both sides of the
      // maker-checker split — the pair V43 warns about. This role holds the
      // judgement; whoever actually moves money gets payroll_pay granted to
      // them explicitly, which in a small business is usually the owner.
    ],
  },
  {
    id: "accountant",
    label: "Accountant / Bookkeeper",
    description: "Keeps the books. Records costs and drafts payroll for someone else to approve.",
    permissions: [
      ...PORTAL, ...DAILY,
      "finance_view", "expense_view", "expense_create", "payment_record",
      "reports", "data_export", "orders", "catalogue",
      "payroll_prepare", "salary_view",
      // Prepares but never approves or pays — the other half of the pair.
    ],
  },
  {
    id: "sales_rep",
    label: "Sales Representative",
    description: "Works leads and customers, takes orders.",
    permissions: [
      ...PORTAL, ...DAILY, ...CRM_READ, ...CRM_WRITE,
      "messaging", "reports",
    ],
  },
  {
    id: "support_staff",
    label: "Support Staff",
    description: "Attendance, leave and their own pay. No customer or money access.",
    permissions: [...PORTAL, "tasks", "calendar"],
  },
  {
    id: "custom",
    label: "Custom",
    description: "Pick permissions individually.",
    permissions: [],
  },
];

const BY_ID: Record<string, RoleDef> = {};
for (const r of ROLES) BY_ID[r.id] = r;
export const roleDef = (id: string) => BY_ID[id];
export const roleLabel = (id: string) => BY_ID[id]?.label || "Custom";

/** Roles offered in the dropdown — everything except system-assigned ones. */
export const SELECTABLE_ROLES = ROLES.filter((r) => !r.systemOnly);

/** The permission set a role grants, with implications resolved. */
export function permissionsForRole(id: string): string[] {
  const def = BY_ID[id];
  if (!def) return [];
  return expandImplied([...new Set(def.permissions)]);
}

/**
 * Which role a permission set corresponds to, or "custom".
 *
 * Used to label someone whose permissions were set before roles existed, and
 * to notice when hand-editing has drifted away from the template. Exact match
 * only — "nearly a Sales Rep" is genuinely custom, and pretending otherwise
 * would mislabel real differences.
 */
export function detectRole(permissions: string[]): RoleId {
  const held = [...new Set(permissions)].sort().join(",");
  for (const r of ROLES) {
    if (r.id === "custom") continue;
    if (permissionsForRole(r.id).sort().join(",") === held) return r.id;
  }
  return "custom";
}

/**
 * What changing role would do — for a preview shown BEFORE anything is applied.
 *
 * Role changes overwrite rather than merge. Merging looks kinder and is worse:
 * permissions accumulate every time someone moves job, and after two or three
 * changes people hold access nobody remembers granting. Overwriting is honest,
 * which is why it has to be shown first.
 */
export function previewRoleChange(current: string[], nextRole: string): {
  gained: string[]; lost: string[]; kept: string[]; result: string[];
} {
  const next = permissionsForRole(nextRole);
  const cur = new Set(current), nxt = new Set(next);
  return {
    gained: next.filter((p) => !cur.has(p)),
    lost: current.filter((p) => !nxt.has(p)),
    kept: current.filter((p) => nxt.has(p)),
    result: next,
  };
}

/**
 * Default role for a department, so a 200-person business isn't configuring
 * each new joiner by hand. Matched on the words businesses actually use.
 */
export function defaultRoleForDepartment(name: string | null | undefined): RoleId | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/(finance|account|book)/.test(n)) return "accountant";
  if (/(hr|human|people|admin)/.test(n)) return "hr_manager";
  if (/(sales|business development|bd)/.test(n)) return "sales_rep";
  if (/(support|service|helpdesk|ops|operation|warehouse|delivery)/.test(n)) return "support_staff";
  return null;
}
