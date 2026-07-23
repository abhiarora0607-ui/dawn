// lib/data-lifecycle.ts
// What a business owns, and the order it has to be deleted in.
//
// Two features need this and they must never disagree:
//
//   · Clear demo data — remove only rows tagged is_demo
//   · Reset organisation — remove everything
//
// Before V45 these were separate lists, and the demo one had gone stale. It
// cleaned up six child tables by employee id, written when six was all there
// were. Since then the product gained payslips, payslip_lines, bonus_requests,
// encashment_requests, leave_requests, leave_balances and employee_accounts —
// none of which were in the list. Clearing demo data left all of them behind,
// pointing at employees that no longer existed.
//
// That is the whole reason this file exists. One map, used by both, so adding
// a table means updating one place instead of remembering two.

/** A table owned by a business, and how rows are attached to one. */
export type OwnedTable = {
  table: string;
  /**
   * How this table relates to an employee:
   *   "own"    — has its own uid, deleted directly
   *   "child"  — belongs to an employee, deleted by employee_id
   *   "nested" — belongs to another row, deleted by its parent's id
   */
  via: "own" | "child" | "nested";
  /** For "nested": the parent table and the column pointing at it. */
  parent?: { table: string; column: string };
  /** Rows carry an is_demo flag, so demo clearing can target them. */
  demoTagged?: boolean;
  /** Human name, for the confirmation screen. */
  label: string;
};

/**
 * Deletion order matters. Children before parents, or a delete leaves rows
 * whose owner is already gone and which nothing can find again.
 */
export const OWNED_TABLES: OwnedTable[] = [
  // ---- nested: must go before their parents ----
  { table: "payslip_lines", via: "nested", parent: { table: "payslips", column: "payslip_id" }, label: "Payslip lines" },

  // ---- employee-owned: deleted by employee_id ----
  { table: "attendance_logs", via: "child", label: "Punch records" },
  { table: "attendance_days", via: "child", label: "Attendance days" },
  { table: "regularization_requests", via: "child", label: "Attendance fix requests" },
  { table: "remote_grants", via: "child", label: "Remote-work grants" },
  { table: "leave_requests", via: "child", label: "Leave requests" },
  { table: "leave_balances", via: "child", label: "Leave balances" },
  { table: "leave_grants", via: "child", label: "Leave grants" },
  { table: "encashment_requests", via: "child", label: "Encashment requests" },
  { table: "bonus_requests", via: "child", label: "Bonus requests" },
  { table: "salary_change_requests", via: "child", label: "Salary change requests" },
  { table: "expense_requests", via: "child", label: "Expense claims" },
  { table: "payslips", via: "child", label: "Payslips" },
  { table: "employee_accounts", via: "child", label: "Portal logins" },
  // Owned, not assigned: a salary row outliving its employee would keep
  // posting an expense every month with nobody attached to it.
  { table: "recurring_expenses", via: "child", label: "Recurring salary rows" },
  { table: "employee_sessions", via: "child", label: "Portal sessions" },

  // ---- business-owned: deleted by uid ----
  { table: "activities", via: "own", label: "Activity feed" },
  { table: "tasks", via: "own", demoTagged: true, label: "Tasks" },
  { table: "emp_notes", via: "own", label: "Notes" },
  { table: "events", via: "own", label: "Calendar events" },
  { table: "conversations", via: "own", label: "Conversations" },
  { table: "messages", via: "own", label: "Messages" },
  { table: "employee_scores", via: "own", label: "Performance scores" },
  { table: "saved_content", via: "own", label: "Saved content" },
  { table: "scheduled_actions", via: "own", label: "Scheduled actions" },
  { table: "payments", via: "own", label: "Payment records" },
  { table: "sales", via: "own", demoTagged: true, label: "Orders" },
  { table: "contacts", via: "own", demoTagged: true, label: "Contacts" },
  { table: "catalog_items", via: "own", demoTagged: true, label: "Price list" },
  { table: "expenses", via: "own", demoTagged: true, label: "Expenses" },

  { table: "attachments", via: "own", label: "Attachments" },
  { table: "holidays", via: "own", label: "Holidays" },
  { table: "leave_types", via: "own", label: "Leave settings" },
  { table: "departments", via: "own", demoTagged: true, label: "Departments" },
  { table: "suggestion_state", via: "own", label: "Suggestion history" },
  { table: "brief_cache", via: "own", label: "Cached briefs" },
  { table: "business_stats", via: "own", label: "Business stats" },
  { table: "metric_snapshots", via: "own", label: "Metric history" },

  // ---- employees last: everything above points at them ----
  { table: "employees", via: "own", demoTagged: true, label: "Employees" },
];

/** Tables that carry an is_demo flag. */
export const DEMO_TAGGED = OWNED_TABLES.filter((t) => t.demoTagged).map((t) => t.table);

/** Everything owned by an employee — the cleanup list when a person is removed. */
export const EMPLOYEE_CHILD_TABLES = OWNED_TABLES.filter((t) => t.via === "child").map((t) => t.table);

/**
 * Tables to count for a confirmation screen, in the order a person would think
 * of them. Not the deletion order — that's driven by foreign keys, this is
 * driven by what someone wants to see before they destroy it.
 */
export const CONFIRMATION_ORDER = [
  "contacts", "sales", "expenses", "employees", "payslips",
  "attendance_days", "leave_requests", "tasks", "emp_notes", "activities",
];

/**
 * What survives a reset, and why.
 *
 * The account itself, the subscription, and the settings that make the app
 * usable. Wiping these would lock the owner out of their own business, which
 * is a support ticket rather than a fresh start.
 */
export const RESET_PRESERVES = [
  "dawn_users",            // the login
  "subscriptions",         // billing state
  "business_settings",     // name, currency, working hours
  "attendance_settings",   // geofence, shift times, payroll config
  "brand_voice",           // tone settings
  "audit_log",             // a reset is itself an auditable act
];

/** A PostgREST filter selecting only demo rows, or everything. */
export function scopeFilter(mode: "demo" | "all", table: OwnedTable): string {
  if (mode === "all") return "";
  return table.demoTagged ? "&is_demo=is.true" : "";
}

/**
 * Whether a table should be touched at all in this mode.
 *
 * Clearing demo data must not delete real rows in tables that have no is_demo
 * flag — those are reached only through demo employees, by employee_id.
 */
export function shouldDelete(mode: "demo" | "all", table: OwnedTable): boolean {
  if (mode === "all") return true;
  if (table.via === "child" || table.via === "nested") return true;  // scoped by parent id
  return !!table.demoTagged;
}
