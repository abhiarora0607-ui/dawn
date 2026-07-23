// lib/workspace.ts
// The portal home is ASSEMBLED, not hardcoded.
//
// Before V51 every employee saw the same fixed home, with one hand-written
// exception (V41 hid the CRM counters from people without CRM permissions).
// V51 makes that exception the rule: a registry of widgets, and a pure
// function that assembles each person's home from who they actually are.
//
// The composition law — each axis has ONE job, so any combination of
// hierarchy × department × permission × role resolves without enumeration:
//   · PERMISSIONS decide inclusion, and only inclusion. Monotonic: granting
//     a permission can only add widgets, never remove or break one.
//   · POSITION (member / lead / admin, from the real reports_to tree) decides
//     authority widgets. Never job titles.
//   · DEPARTMENT decides priority and defaults, NEVER access. A mis-named
//     department can only mis-order cards, never leak or hide capability.
//   · WORKLOAD decides ordering: a card with three approvals waiting outranks
//     a static stat.
//   · ROLES decide nothing at runtime — they stay grant-time permission
//     bundles, so a "custom" employee works identically.
//
// Two guarantees hold by construction:
//   · The FLOOR (the Today card) needs no permission, so no employee can ever
//     get an empty home.
//   · Assembly is a pure function of context — View-As shows exactly what the
//     employee sees, and every persona is unit-testable.
//
// Security note: this file is PRESENTATION ONLY. Every underlying API keeps
// its guardEmployee/permission checks. A mis-assembled widget renders an
// empty card; it cannot leak data.

export type DeptFlavor = "sales" | "finance" | "hr" | "ops" | "none";

export type WorkspaceCounts = {
  /** Approvals this person can decide RIGHT NOW (permission-gated). */
  actionableApprovals: number;
  teamOnLeaveToday: number;
  teamPresentToday: number;
  myPendingLeave: number;
  /** Draft payslips awaiting approval — counted only for people who can approve. */
  payrollDrafts: number;
};

export type WorkspaceCtx = {
  permissions: string[];          // migrated to current vocabulary
  isAdmin: boolean;
  isLead: boolean;                // has at least one active report
  teamSize: number;
  dept: DeptFlavor;
  counts: WorkspaceCounts;
  hasScore: boolean;              // client merges this in (score is client-known)
};

export type WidgetDef = {
  id: string;
  /** Which render the portal maps this to. */
  component: string;
  size: "hero" | "card";
  /** ANY-of permission requirement. Absent = floor: shown to everyone. */
  perm?: string | string[];
  /** Relevance beyond permission (position, counts, department). */
  when?: (c: WorkspaceCtx) => boolean;
  /** Higher renders first. Read counts here so attention drives order. */
  priority: (c: WorkspaceCtx) => number;
};

export type AssembledWidget = { id: string; component: string; size: "hero" | "card"; priority: number };

/**
 * Department flavor from its name — the same keyword approach the role
 * defaulter uses. Flavor only ever nudges ORDER; an unmatched name degrades
 * to "none" and the person gets a position-correct generic home.
 */
export function flavorOfDepartment(name: string | null | undefined): DeptFlavor {
  const n = (name || "").toLowerCase();
  if (!n) return "none";
  if (/(sales|business|bd|growth|revenue)/.test(n)) return "sales";
  if (/(finance|account|payroll|billing)/.test(n)) return "finance";
  if (/(hr|people|talent|human)/.test(n)) return "hr";
  if (/(ops|operation|support|service|delivery|fulfil)/.test(n)) return "ops";
  return "none";
}

/** ANY-of permission check. No requirement = floor = always true. */
export function holds(perms: string[], req?: string | string[]): boolean {
  if (!req) return true;
  const list = Array.isArray(req) ? req : [req];
  return list.some((p) => perms.includes(p));
}

// ---------------------------------------------------------------- registry

export const WIDGETS: WidgetDef[] = [
  // FLOOR — permission-free, the guarantee that nobody gets a blank home.
  { id: "today", component: "today", size: "hero", priority: () => 100 },

  // Approvals waiting that this person can ACT on. The count is computed
  // server-side through the same permission gates as the approval routes
  // (leave_approve / attendance_approve), so a lead a request has escalated
  // PAST sees no dead button here — their actionable count is zero.
  { id: "approvals_count", component: "approvals_count", size: "card",
    when: (c) => c.counts.actionableApprovals > 0,
    priority: (c) => 90 + Math.min(c.counts.actionableApprovals, 9) },

  // A lead's team at a glance. Position-gated: leads and admins with people.
  { id: "team_today", component: "team_today", size: "card",
    when: (c) => (c.isLead || c.isAdmin) && c.teamSize > 0,
    priority: (c) => (c.dept === "hr" ? 85 : 80) },

  // Personal score, when the scoring engine has enough history.
  { id: "my_score", component: "my_score", size: "card",
    when: (c) => c.hasScore,
    priority: () => 70 },

  // The payroll run, for people with payroll capability. Attention-driven:
  // drafts waiting lift it near the top; finance-department people keep it on
  // their home even when the run is clean.
  { id: "payroll_run", component: "payroll_run", size: "card",
    perm: ["salary_view", "payroll_approve", "payroll_pay", "payroll_prepare"],
    when: (c) => c.counts.payrollDrafts > 0 || c.dept === "finance",
    priority: (c) => (c.counts.payrollDrafts > 0 ? 88 : 66) },

  // The doer block: CRM counters. Department flavor nudges it above the score
  // for sales people, below for everyone else — order, never access.
  { id: "crm_stats", component: "crm_stats", size: "card",
    perm: ["leads", "customers", "orders"],
    priority: (c) => (c.dept === "sales" ? 75 : 60) },
];

// ---------------------------------------------------------------- assembly

/**
 * A widget rule that throws must cost that widget, never the page. The React
 * #31 crash taught this: one bad value must degrade, not blank the home.
 */
function safeWhen(w: WidgetDef, c: WorkspaceCtx): boolean {
  try { return w.when ? w.when(c) : true; } catch { return false; }
}
function safePriority(w: WidgetDef, c: WorkspaceCtx): number {
  try { return Number(w.priority(c)) || 0; } catch { return 0; }
}

export function assembleWorkspace(ctx: WorkspaceCtx, registry: WidgetDef[] = WIDGETS): AssembledWidget[] {
  const out = registry
    .filter((w) => holds(ctx.permissions, w.perm))
    .filter((w) => safeWhen(w, ctx))
    .map((w) => ({ id: w.id, component: w.component, size: w.size, priority: safePriority(w, ctx) }))
    .sort((a, b) => b.priority - a.priority);

  // The floor guarantee, enforced even if the registry is edited badly.
  if (!out.some((w) => w.id === "today")) {
    out.unshift({ id: "today", component: "today", size: "hero", priority: 100 });
  }
  return out;
}

/** A context that renders a safe floor-only home when the workspace endpoint fails. */
export const FALLBACK_CTX: WorkspaceCtx = {
  permissions: [], isAdmin: false, isLead: false, teamSize: 0, dept: "none",
  counts: { actionableApprovals: 0, teamOnLeaveToday: 0, teamPresentToday: 0, myPendingLeave: 0, payrollDrafts: 0 },
  hasScore: false,
};
