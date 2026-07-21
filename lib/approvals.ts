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
  if (ctx.isAdmin) return { ok: true };
  if (!ctx.meId) return { ok: false, why: "Sign in first." };

  // The rule that matters most: nobody signs off their own request.
  if (subjectId === ctx.meId) {
    return { ok: false, why: "You can't decide your own request — it goes to your manager." };
  }
  if (!ctx.org.myTeam.includes(subjectId)) {
    return { ok: false, why: "You can only decide requests from people on your team." };
  }
  if (!(ctx.permissions.includes("team_edit") || ctx.org.myTeam.length > 0)) {
    return { ok: false, why: "You don't have permission to decide requests." };
  }
  return { ok: true };
}

/**
 * Whose requests land in this person's queue. The owner sees everything; a
 * manager sees their subtree and never themselves, so their own pending leave
 * doesn't sit in a list where they could approve it.
 */
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
