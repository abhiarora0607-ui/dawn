// lib/inbox.ts
// The one place that says who may decide what, for the portal's unified
// approvals inbox — by DELEGATING to the authority functions that already
// govern the routes. The inbox invents no rules of its own: if it disagreed
// with the routes, a button would render that the server then refuses, or a
// decidable request would hide. Invariant 27 holds this file to that.
//
// Kinds and their authority (worldwide-standard shape — requests climb the
// line-management chain; money needs finance; nobody decides their own):
//   · leave   → canDecideWith(ctx, subject, "leave_approve")
//   · fix     → canDecideWith(ctx, subject, "attendance_approve")
//   · salary  → canApproveSalaryChange (finance/admin, never the proposer)
//   · bonus   → admin only (the route's hard block, mirrored here)
//
// Ordering is FIFO — the global queue standard: what you can act on comes
// first, oldest first, so nothing rots at the bottom of a list.

import { canDecideWith, type ApprovalContext } from "@/lib/approvals";
import { canApproveSalaryChange } from "@/lib/salary-authority";

export type InboxKind = "leave" | "fix" | "salary" | "bonus" | "expense";

export type InboxItem = {
  kind: InboxKind;
  id: string;
  employeeId: string;       // whose request / whose pay
  employeeName: string;
  title: string;
  sub: string;
  createdAt: string;        // ISO — FIFO key
  actionable: boolean;
  /** When not actionable: whose queue it actually landed in. */
  withName?: string;
  /** True when the viewer raised it (their own proposal, watching status). */
  mine?: boolean;
};

/**
 * May this viewer decide this item? One switch, all delegation.
 * `subjectEmployeeId` is whose request it is; for salary/bonus the proposer
 * matters too (maker-checker: never your own proposal).
 */
export function actionableFor(
  kind: InboxKind,
  appr: ApprovalContext,
  subjectEmployeeId: string,
  proposerId: string | null,
): boolean {
  if (kind === "leave") return canDecideWith(appr, subjectEmployeeId, "leave_approve").ok;
  if (kind === "fix") return canDecideWith(appr, subjectEmployeeId, "attendance_approve").ok;
  if (kind === "salary") {
    return canApproveSalaryChange(
      { isAdmin: appr.isAdmin, permissions: appr.permissions },
      proposerId || "",
      appr.meId,
    );
  }
  // bonus: the route hard-blocks to admin; mirror exactly, including the
  // no-self rule for an admin who somehow proposed their own.
  if (kind === "bonus") return appr.isAdmin && (!appr.meId || appr.meId !== proposerId || proposerId === null);
  // expense: finance eyes (the same signals the route checks), and never
  // your own claim — the claimant IS the subject here.
  if (kind === "expense") {
    const finance = appr.isAdmin
      || appr.permissions.includes("expense_approve")
      || appr.permissions.includes("payment_record");
    return finance && (!appr.meId || appr.meId !== subjectEmployeeId);
  }
  return false;
}

/** Actionable first; FIFO (oldest first) within each band. */
export function sortInbox<T extends { actionable: boolean; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.actionable !== b.actionable) return a.actionable ? -1 : 1;
    return String(a.createdAt).localeCompare(String(b.createdAt));
  });
}
