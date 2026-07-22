// V48b salary-edit authority. Deciding who can change pay, and whether it's
// immediate or needs sign-off — asserted rather than assumed.
import * as S from "../lib/salary-authority.ts";

const t: [string, any, string][] = [];
const actor = (isAdmin: boolean, perms: string[]) => ({ isAdmin, permissions: perms });

// ---- direct edit: finance and admin ----
t.push(["admin edits directly", String(S.canEditSalaryDirectly(actor(true, []))), "true"]);
t.push(["finance (expense_approve) edits directly", String(S.canEditSalaryDirectly(actor(false, ["expense_approve"]))), "true"]);
t.push(["finance (payment_record) edits directly", String(S.canEditSalaryDirectly(actor(false, ["payment_record"]))), "true"]);
t.push(["a plain lead does not edit directly", String(S.canEditSalaryDirectly(actor(false, ["salary_edit"]))), "false"]);
t.push(["nobody with nothing edits directly", String(S.canEditSalaryDirectly(actor(false, []))), "false"]);

// ---- propose: lead with salary_edit only ----
t.push(["lead with salary_edit proposes", String(S.canProposeSalaryChange(actor(false, ["salary_edit"]))), "true"]);
t.push(["finance proposes nothing (edits instead)", String(S.canProposeSalaryChange(actor(false, ["expense_approve", "salary_edit"]))), "false"]);
t.push(["admin proposes nothing (edits instead)", String(S.canProposeSalaryChange(actor(true, ["salary_edit"]))), "false"]);
t.push(["no salary_edit, no proposal", String(S.canProposeSalaryChange(actor(false, ["leads"]))), "false"]);

// ---- mode ----
t.push(["admin mode is direct", S.salaryEditMode(actor(true, [])), "direct"]);
t.push(["finance mode is direct", S.salaryEditMode(actor(false, ["payment_record"])), "direct"]);
t.push(["lead mode is propose", S.salaryEditMode(actor(false, ["salary_edit"])), "propose"]);
t.push(["stranger mode is denied", S.salaryEditMode(actor(false, ["tasks"])), "denied"]);

// ---- approval of a proposal ----
// finance approving a lead's proposal: ok
t.push(["finance approves a lead's proposal", String(S.canApproveSalaryChange(actor(false, ["expense_approve"]), "lead1", "fin1")), "true"]);
t.push(["admin approves a proposal", String(S.canApproveSalaryChange(actor(true, []), "lead1", "adm1")), "true"]);
// a lead can't approve (not finance/admin)
t.push(["a lead can't approve a proposal", String(S.canApproveSalaryChange(actor(false, ["salary_edit"]), "lead2", "lead1")), "false"]);
// nobody approves their OWN proposal, even finance
t.push(["nobody approves their own proposal", String(S.canApproveSalaryChange(actor(false, ["expense_approve"]), "fin1", "fin1")), "false"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} SALARY-AUTHORITY RULES CORRECT ***` : `\n*** ${bad} SALARY FAILURE(S) ***`);
