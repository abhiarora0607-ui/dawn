// lib/salary-authority.ts
// Who may change a salary, and whether it takes effect immediately.
//
// The rule settled in V48b:
//   · Finance or admin  → edit directly. Their change is self-approving,
//     because they ARE the approving authority.
//   · A lead with salary_edit → may PROPOSE a change. It doesn't take effect
//     until finance or admin approves it — the same maker-checker split that
//     governs payroll. A lead setting a number and it landing unchecked is
//     exactly the collapse this prevents.
//   · Anyone else → no.
//
// The employee whose salary it is never sees the proposal or the approval;
// salary changes aren't announced. The trail lives in the audit log.

export type SalaryActor = {
  isAdmin: boolean;
  permissions: string[];
};

/** True for finance or admin — the people whose salary edit is immediate. */
export function canEditSalaryDirectly(actor: SalaryActor): boolean {
  // Admin always. Otherwise it takes an explicit finance signal — holding
  // expense_approve or payment_record marks someone as finance, the same
  // roles that sign off money elsewhere.
  if (actor.isAdmin) return true;
  return actor.permissions.includes("expense_approve")
    || actor.permissions.includes("payment_record");
}

/** True for a lead who may propose but not enact a change. */
export function canProposeSalaryChange(actor: SalaryActor): boolean {
  if (canEditSalaryDirectly(actor)) return false;   // they'd just edit directly
  return actor.permissions.includes("salary_edit");
}

/** What happens when this actor submits a salary change. */
export function salaryEditMode(actor: SalaryActor): "direct" | "propose" | "denied" {
  if (canEditSalaryDirectly(actor)) return "direct";
  if (canProposeSalaryChange(actor)) return "propose";
  return "denied";
}

/** Who may approve a proposed change: finance or admin, never the proposer. */
export function canApproveSalaryChange(actor: SalaryActor, proposerId: string, meId: string | null): boolean {
  if (meId && meId === proposerId) return false;   // never approve your own proposal
  return canEditSalaryDirectly(actor);
}
