// lib/permissions.ts
// The full vocabulary of what someone may do.
//
// This replaces two disconnected lists — 15 CRM permissions in employee-auth
// and 7 org permissions in org.ts — that never knew about each other. Anything
// financial fell into a single `financials` flag covering revenue figures,
// expenses and payment recording at once, so "can see expenses but can't record
// payments" was unsayable. That distinction is the whole basis of segregation
// of duties.
//
// Design constraints, in order of importance:
//
//   1. A permission names ONE action on ONE thing. If a label needs "and", it
//      should be two permissions.
//   2. Grouped for presentation. Forty checkboxes in a flat list is a wall
//      nobody reads; eight groups of five is a form.
//   3. Every permission maps to a real screen or route. Nothing decorative —
//      an unenforced permission is a lie told to whoever grants it.

export type PermissionGroup =
  | "core" | "crm" | "sales" | "finance" | "payroll" | "people" | "org" | "admin";

export type PermissionDef = {
  id: string;
  group: PermissionGroup;
  label: string;
  /** Shown under the label when the consequence isn't obvious from the name. */
  hint?: string;
  /** Money or people data. Surfaced differently and never granted casually. */
  sensitive?: boolean;
  /** Implied by this one, so the UI can tick them automatically. */
  implies?: string[];
  /**
   * Where this permission has effect:
   *   "portal" — gates an employee-facing route; grantable to employees.
   *   "owner"  — an owner-dashboard action. The owner has it by definition;
   *              granting it to an employee does nothing, so it's hidden from
   *              the picker rather than offered as a checkbox that lies.
   * V48b: several permissions were owner-only but still appeared grantable.
   * Marking scope makes the picker honest and lets an invariant demand that
   * every PORTAL permission has a real enforcement site.
   */
  scope?: "portal" | "owner";
};

export const GROUP_LABELS: Record<PermissionGroup, string> = {
  core: "Basics",
  crm: "Contacts",
  sales: "Orders & catalogue",
  finance: "Money",
  payroll: "Payroll",
  people: "Team",
  org: "Organisation",
  admin: "Administration",
};

export const GROUP_ORDER: PermissionGroup[] = [
  "core", "crm", "sales", "finance", "payroll", "people", "org", "admin",
];

export const PERMISSIONS: PermissionDef[] = [
  // ---- basics ----
  { id: "dashboard", group: "core", label: "Sign in to the portal", hint: "Without this they can't use the employee app at all." },
  { id: "tasks", group: "core", label: "Tasks" },
  { id: "calendar", group: "core", label: "Calendar", scope: "owner" },
  { id: "notes", group: "core", label: "Notes" },
  { id: "settings", group: "core", label: "Edit their own profile", scope: "owner" },

  // ---- contacts ----
  { id: "leads", group: "crm", label: "See leads" },
  { id: "leads_edit", group: "crm", label: "Add and edit leads", implies: ["leads"] },
  { id: "customers", group: "crm", label: "See customers" },
  { id: "customers_edit", group: "crm", label: "Add and edit customers", implies: ["customers"] },
  { id: "contacts_delete", group: "crm", label: "Delete contacts", hint: "Deleted contacts can be restored for 30 days.", sensitive: true, scope: "owner" },
  { id: "messaging", group: "crm", label: "Send messages" },

  // ---- orders ----
  { id: "orders", group: "sales", label: "See orders" },
  { id: "orders_edit", group: "sales", label: "Create and edit orders", implies: ["orders"] },
  { id: "orders_cancel", group: "sales", label: "Cancel orders", sensitive: true, scope: "owner" },
  { id: "catalogue", group: "sales", label: "See the price list" },
  { id: "catalogue_edit", group: "sales", label: "Change prices", hint: "Affects every future quote and order.", sensitive: true, implies: ["catalogue"], scope: "owner" },
  // V54: the content studio reaches the portal. Off by default, granted by an
  // admin — a marketing hand can generate ideas, captions, and carousels with
  // the business's own account context, without owner dashboard access.
  { id: "content_tools", group: "sales", label: "Content studio", hint: "Generate post ideas, captions, and carousels with Dawn's AI." },

  // ---- money ----
  // The split that `financials` was hiding. Seeing a number, recording a cost,
  // approving someone else's, and taking payment are four different jobs.
  { id: "finance_view", group: "finance", label: "See revenue figures", hint: "Money figures on dashboards and reports.", sensitive: true },
  { id: "expense_view", group: "finance", label: "See expenses", sensitive: true, scope: "owner" },
  { id: "expense_create", group: "finance", label: "Record an expense", implies: ["expense_view"], scope: "owner" },
  { id: "expense_approve", group: "finance", label: "Approve expenses", hint: "Sign off costs someone else recorded — including portal expense claims.", sensitive: true, implies: ["expense_view"] },
  { id: "payment_record", group: "finance", label: "Record a payment received", hint: "Marks an order paid.", sensitive: true, scope: "owner" },
  { id: "reports", group: "finance", label: "See reports" },
  { id: "data_export", group: "finance", label: "Export data", hint: "Download contacts, orders and figures as a file.", sensitive: true },

  // ---- payroll ----
  // Three hands, deliberately. Preparing was fused into admin until now, which
  // meant one person could set a salary, draft the payslip, approve it and pay
  // it — the exact collapse segregation of duties exists to prevent.
  { id: "payroll_prepare", group: "payroll", label: "Draft payslips", hint: "Generate the month's payroll for checking.", sensitive: true },
  { id: "payroll_approve", group: "payroll", label: "Approve payslips", hint: "Sign off that the figures are right.", sensitive: true },
  { id: "payroll_pay", group: "payroll", label: "Mark payslips paid", hint: "This is what puts the salary into your books.", sensitive: true },
  { id: "salary_view", group: "payroll", label: "See salaries", sensitive: true },
  { id: "salary_edit", group: "payroll", label: "Change salaries", hint: "Never delegated — admins only.", sensitive: true, implies: ["salary_view"], scope: "owner" },
  { id: "bonus_request", group: "payroll", label: "Propose a bonus", hint: "Still needs an admin to approve it." },
  { id: "bonus_approve", group: "payroll", label: "Approve bonuses", sensitive: true, scope: "owner" },

  // ---- team ----
  { id: "team_view", group: "people", label: "See their team's records", hint: "Attendance and leave for people reporting to them.", scope: "owner" },
  { id: "team_edit", group: "people", label: "Edit their team's records", implies: ["team_view"], scope: "owner" },
  { id: "leave_approve", group: "people", label: "Approve leave", hint: "For their own team only.", implies: ["team_view"] },
  { id: "attendance_approve", group: "people", label: "Approve attendance fixes", implies: ["team_view"] },
  { id: "people_directory", group: "people", label: "Look up colleagues", hint: "Names, roles and contact details.", scope: "owner" },

  // ---- organisation ----
  { id: "org_view", group: "org", label: "See the org chart", scope: "owner" },
  { id: "org_manage", group: "org", label: "Change departments and reporting lines", sensitive: true, implies: ["org_view"], scope: "owner" },
  { id: "employee_view", group: "org", label: "See the employee list", scope: "owner" },
  { id: "employee_edit", group: "org", label: "Add and edit employees", sensitive: true, implies: ["employee_view"], scope: "owner" },

  // ---- administration ----
  { id: "access_manage", group: "admin", label: "Grant and revoke access", hint: "They can only ever pass on what they hold themselves.", sensitive: true, scope: "owner" },
  { id: "business_settings", group: "admin", label: "Change business settings", sensitive: true, scope: "owner" },
  { id: "billing", group: "admin", label: "Billing", hint: "Never delegated — the account owner only.", sensitive: true, scope: "owner" },
];

export const PERMISSION_IDS = PERMISSIONS.map((p) => p.id);
const BY_ID: Record<string, PermissionDef> = {};
for (const p of PERMISSIONS) BY_ID[p.id] = p;
export const permissionDef = (id: string) => BY_ID[id];
export const permissionLabel = (id: string) => BY_ID[id]?.label || id;

/** Never handed to anyone but the owner, whoever asks. */
export const NEVER_DELEGATED = ["salary_edit", "billing"];

/** Permissions that gate an employee-facing route — the ones worth offering. */
export const PORTAL_PERMISSIONS = PERMISSIONS.filter((p) => p.scope !== "owner").map((p) => p.id);

/** Owner-dashboard permissions — hidden from the employee picker. */
export const OWNER_PERMISSIONS = PERMISSIONS.filter((p) => p.scope === "owner").map((p) => p.id);

/** Is this permission worth offering to an employee at all? */
export function isGrantable(id: string): boolean {
  return BY_ID[id]?.scope !== "owner";
}

// ---------------------------------------------------------------- implication

/**
 * Expand a set to include what it implies. Granting "add and edit leads"
 * without "see leads" would produce someone who can edit a list they can't
 * open — a state the UI would have to defend against everywhere.
 */
export function expandImplied(ids: string[]): string[] {
  const out = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...out]) {
      for (const dep of BY_ID[id]?.implies || []) {
        if (!out.has(dep)) { out.add(dep); changed = true; }
      }
    }
  }
  return [...out];
}

/** Removing a permission removes anything that depended on it. */
export function cascadeRemoval(ids: string[], removed: string): string[] {
  const keep = ids.filter((id) => id !== removed);
  return keep.filter((id) => !(BY_ID[id]?.implies || []).includes(removed));
}

// ------------------------------------------------------- separation of duties

/**
 * Pairs that shouldn't sit with one person.
 *
 * These WARN rather than block, deliberately. A two-person business has nobody
 * to separate duties with — the owner necessarily holds everything, and a
 * product that refused to let them work would be unusable at the small end of
 * the range it's meant to serve. The warning is for the moment a business grows
 * past the point where one person holding both is still reasonable.
 */
export const CONFLICTS: { a: string; b: string; why: string }[] = [
  {
    a: "payroll_prepare", b: "payroll_approve",
    why: "The same person drafting and approving payroll means nobody checks the figures.",
  },
  {
    a: "payroll_approve", b: "payroll_pay",
    why: "Approving and paying should be separate hands — it's the main guard against a payment nobody authorised.",
  },
  {
    a: "expense_create", b: "expense_approve",
    why: "Recording an expense and approving it is how a fake cost gets into the books unnoticed.",
  },
  {
    a: "salary_edit", b: "payroll_pay",
    why: "Someone who can both set a salary and pay it can quietly raise their own.",
  },
  {
    a: "bonus_request", b: "bonus_approve",
    why: "Proposing and approving a bonus is one person awarding money on their own say-so.",
  },
  {
    a: "employee_edit", b: "payroll_pay",
    why: "Adding an employee and paying them means one person can create a name and pay it.",
  },
];

export type Conflict = { a: string; b: string; why: string; labels: [string, string] };

/** Which conflicting pairs this permission set contains. */
export function conflictsIn(ids: string[]): Conflict[] {
  const has = new Set(ids);
  return CONFLICTS
    .filter((c) => has.has(c.a) && has.has(c.b))
    .map((c) => ({ ...c, labels: [permissionLabel(c.a), permissionLabel(c.b)] as [string, string] }));
}

/** Conflicts that adding `candidate` would introduce — for a live warning. */
export function conflictsAdding(current: string[], candidate: string): Conflict[] {
  const has = new Set(current);
  return CONFLICTS
    .filter((c) => (c.a === candidate && has.has(c.b)) || (c.b === candidate && has.has(c.a)))
    .map((c) => ({ ...c, labels: [permissionLabel(c.a), permissionLabel(c.b)] as [string, string] }));
}

// ------------------------------------------------------------------ migration

/**
 * Old permission ids to new ones.
 *
 * `financials` deliberately becomes LESS than it was. It covered seeing revenue,
 * seeing expenses and everything money-shaped at once; it maps to viewing only.
 * Anyone who genuinely needs to record or approve gets it granted deliberately.
 * Someone asking for access they've lost is a far better failure than someone
 * silently keeping access nobody meant them to have.
 */
export const LEGACY_MAP: Record<string, string[]> = {
  dashboard: ["dashboard"],
  leads: ["leads"],
  customers: ["customers"],
  orders: ["orders"],
  edit_leads: ["leads", "leads_edit"],
  edit_customers: ["customers", "customers_edit"],
  edit_orders: ["orders", "orders_edit"],
  messaging: ["messaging"],
  tasks: ["tasks"],
  calendar: ["calendar"],
  notes: ["notes"],
  reports: ["reports"],
  data_export: ["data_export"],
  financials: ["finance_view", "expense_view"],
  settings: ["settings"],
  // V38 org permissions carry across unchanged.
  salary_view: ["salary_view"],
  salary_edit: ["salary_edit", "salary_view"],
  bonus_request: ["bonus_request"],
  payroll_pay: ["payroll_pay"],
  team_view: ["team_view"],
  team_edit: ["team_view", "team_edit"],
  org_manage: ["org_view", "org_manage"],
};

/** Translate a stored permission list into the new vocabulary. */
export function migratePermissions(old: string[]): string[] {
  const out = new Set<string>();
  for (const p of old || []) {
    for (const n of LEGACY_MAP[p] || []) out.add(n);
    // Already migrated, or granted after the change.
    if (!LEGACY_MAP[p] && BY_ID[p]) out.add(p);
  }
  return expandImplied([...out]);
}

/**
 * Backwards compatibility for routes not yet migrated. `financials` is answered
 * by finance_view so nothing silently loses access mid-rollout.
 */
export const LEGACY_ALIASES: Record<string, string[]> = {
  financials: ["finance_view"],
  edit_leads: ["leads_edit"],
  edit_customers: ["customers_edit"],
  edit_orders: ["orders_edit"],
};

/** Does this set satisfy a permission, including via an old alias? */
export function satisfies(ids: string[], needed: string): boolean {
  if (ids.includes(needed)) return true;
  for (const modern of LEGACY_ALIASES[needed] || []) {
    if (ids.includes(modern)) return true;
  }
  return false;
}
