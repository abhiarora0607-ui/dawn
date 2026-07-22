// lib/approvals.ts
// Who may decide a request.
//
// Until V40 the answer was always "the owner", which is fine at three people
// and unusable at fifty — every half-day off in the company queues behind one
// person. Now a request rises to the applicant's manager, and the owner keeps
// an override.
//
// Two rules do the work, and both exist to stop obvious abuse:
//
//   · You must be ABOVE someone to decide their request. Not beside them, not
//     merely in the same department.
//   · You may never decide your own. A lead's leave rises to their lead; if
//     nobody is above them, it goes to the owner.

import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getEmployee } from "@/lib/employee-auth";
import { loadOrg, type OrgContext } from "@/lib/org-db";

export type ApprovalContext = {
  uid: string;
  url: string;
  key: string;
  /** null when the owner is signed in — they sit outside the employee tree. */
  meId: string | null;
  permissions: string[];
  org: OrgContext;
  isAdmin: boolean;
  blocked?: any;
};

/**
 * Resolve whoever is signed in — owner or employee — and load the org around
 * them. Routes that previously accepted only an owner session call this and
 * become manager-aware without restructuring.
 */
export async function resolveApprover(): Promise<ApprovalContext | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;

  const ownerUid = await getUid();
  if (ownerUid) {
    const blocked = await requireArea(url, key, ownerUid, "crm");
    const org = await loadOrg(url, key, ownerUid, null);
    return { uid: ownerUid, url, key, meId: null, permissions: [], org, isAdmin: true, blocked };
  }

  const emp = await getEmployee();
  if (emp) {
    const org = await loadOrg(url, key, emp.uid, emp.employeeId);
    return {
      uid: emp.uid, url, key, meId: emp.employeeId,
      permissions: emp.permissions || [],
      org, isAdmin: org.isAdmin,
    };
  }
  return null;
}

/**
 * May this person decide a request belonging to `subjectId`?
 *
 * Deliberately stricter than visibility. A department head can *see* everyone
 * in their department, but approving someone's leave is an act of authority
 * over them — it should require actually being above them.
 */
export function canDecideFor(ctx: ApprovalContext, subjectId: string): { ok: boolean; why?: string } {
  return canDecideWith(ctx, subjectId, "leave_approve");
}

/**
 * May this person decide a `subjectId` request that needs `permission`?
 *
 * The rule, settled in V48b:
 *   · Never your own request — being a lead doesn't exempt you. For your own
 *     request you're just an employee, and it rises from your position.
 *   · You must be above the subject in the tree (their request reached you).
 *   · You must actually HOLD the approval permission. Managing a team is no
 *     longer enough on its own — that was the hole where any lead could
 *     approve anything.
 * The admin always satisfies all three.
 */
export function canDecideWith(
  ctx: ApprovalContext, subjectId: string, permission: string,
): { ok: boolean; why?: string } {
  if (ctx.isAdmin) return { ok: true };
  if (!ctx.meId) return { ok: false, why: "Sign in first." };

  if (subjectId === ctx.meId) {
    return { ok: false, why: "You can't decide your own request — it goes up to your manager." };
  }
  if (!ctx.org.myTeam.includes(subjectId)) {
    return { ok: false, why: "You can only decide requests from people on your team." };
  }
  // The change that makes the permission mean something: holding the approval
  // permission is now required, not merely implied by having reports.
  if (!ctx.permissions.includes(permission)) {
    return { ok: false, why: "This needs someone with approval permission — it's gone to your manager." };
  }
  return { ok: true };
}

/**
 * Walk UP the tree from the subject to the first person who can actually
 * approve this kind of request, skipping:
 *   · the subject themselves (no self-approval, even for a lead),
 *   · anyone who doesn't hold the required permission.
 * Returns the admin/owner as the guaranteed backstop when nobody in the chain
 * qualifies.
 *
 * `permsOf` gives an employee's held permissions; the owner sits outside the
 * tree and holds everything.
 */
export function escalateApprover(
  subjectId: string,
  employees: { id: string; reports_to: string | null; is_admin?: boolean; is_owner?: boolean }[],
  permsOf: (employeeId: string) => string[],
  permission: string,
): { approverId: string | null; chain: string[] } {
  const byId: Record<string, typeof employees[number]> = {};
  for (const e of employees) byId[e.id] = e;

  const chain: string[] = [];
  const seen = new Set<string>();     // cycle guard — a broken reports_to loop must not hang
  let cur = byId[subjectId]?.reports_to || null;

  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    const person = byId[cur];
    if (!person) break;
    // Admin/owner always qualifies and is the backstop.
    if (person.is_admin || person.is_owner) return { approverId: cur, chain };
    // Otherwise they must hold the permission to stop the climb here.
    if (permsOf(cur).includes(permission)) return { approverId: cur, chain };
    cur = person.reports_to || null;
  }

  // Nobody in the chain qualified — it belongs to the owner/admin.
  const admin = employees.find((e) => e.is_owner) || employees.find((e) => e.is_admin);
  return { approverId: admin?.id || null, chain };
}

/**
 * Whose requests this person can ACT ON, for a given approval permission.
 *
 * The owner sees and acts on everything. A manager acts on their subtree —
 * but only if they hold the permission; without it the request has escalated
 * past them and lands in someone else's actionable queue. They can still SEE
 * it (see visibleScope), just not decide it.
 */
export function actionableScope(ctx: ApprovalContext, permission = "leave_approve"): string[] | "all" {
  if (ctx.isAdmin) return "all";
  if (!ctx.permissions.includes(permission)) return [];   // escalated past them
  return ctx.org.myTeam.filter((id) => id !== ctx.meId);
}

/**
 * Whose requests this person can SEE, whether or not they can act. A lead sees
 * their whole team's requests even ones that escalated past them — so nothing
 * appears to vanish. Visibility follows the org tree; action follows the
 * permission.
 */
export function visibleScope(ctx: ApprovalContext): string[] | "all" {
  if (ctx.isAdmin) return "all";
  return ctx.org.myTeam.filter((id) => id !== ctx.meId);
}

/** Kept for callers that haven't moved to the permission-aware split yet. */
export function queueScope(ctx: ApprovalContext): string[] | "all" {
  if (ctx.isAdmin) return "all";
  return ctx.org.myTeam.filter((id) => id !== ctx.meId);
}

/** A PostgREST filter for the caller's approval queue. */
export function queueFilter(ctx: ApprovalContext, column = "employee_id"): string {
  const scope = queueScope(ctx);
  if (scope === "all") return "";
  if (scope.length === 0) return `&${column}=eq.00000000-0000-0000-0000-000000000000`;
  return `&${column}=in.(${scope.join(",")})`;
}

/** Who a new request should be routed to, for display. */
export function approverNameFor(ctx: ApprovalContext, subjectId: string): string {
  const managerId = ctx.org.approverFor(subjectId);
  if (!managerId) return "the owner";
  return ctx.org.employees.find((e) => e.id === managerId)?.name || "your manager";
}
