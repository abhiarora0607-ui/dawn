// V52 inbox rules. The inbox decides which buttons render across every
// approval kind, so its delegation to the real authority functions is
// asserted persona by persona — the same fixtures the escalation suite uses.
import { actionableFor, sortInbox } from "../lib/inbox.ts";

const t: [string, any, string][] = [];
const mk = (meId: string, isAdmin: boolean, perms: string[], team: string[]) => ({
  uid: "u", url: "", key: "", meId, permissions: perms, isAdmin,
  org: { myTeam: team } as any,
});

// ---- leave: permission + team, never self (delegates to canDecideWith) ----
t.push(["lead with leave_approve decides team leave", String(actionableFor("leave", mk("priya", false, ["leave_approve"], ["rahul", "sneha"]), "rahul", null)), "true"]);
t.push(["lead WITHOUT the permission cannot", String(actionableFor("leave", mk("priya", false, [], ["rahul"]), "rahul", null)), "false"]);
t.push(["off-team request cannot be decided", String(actionableFor("leave", mk("priya", false, ["leave_approve"], ["rahul"]), "arjun", null)), "false"]);
t.push(["nobody decides their own leave", String(actionableFor("leave", mk("priya", false, ["leave_approve"], ["priya", "rahul"]), "priya", null)), "false"]);
t.push(["admin decides anyone's leave", String(actionableFor("leave", mk("divya", true, [], []), "fatima", null)), "true"]);

// ---- fix: its own permission, not leave's ----
t.push(["attendance fix needs attendance_approve", String(actionableFor("fix", mk("priya", false, ["leave_approve"], ["rahul"]), "rahul", null)), "false"]);
t.push(["fix decided with the right permission", String(actionableFor("fix", mk("priya", false, ["attendance_approve"], ["rahul"]), "rahul", null)), "true"]);

// ---- salary: finance/admin, never the proposer (maker-checker) ----
t.push(["finance approves a lead's salary proposal", String(actionableFor("salary", mk("karan", false, ["expense_approve"], []), "rahul", "priya")), "true"]);
t.push(["a plain lead cannot approve salary", String(actionableFor("salary", mk("priya", false, ["salary_edit"], ["rahul"]), "rahul", "priya")), "false"]);
t.push(["the proposer never approves their own", String(actionableFor("salary", mk("priya", false, ["expense_approve"], []), "rahul", "priya")), "false"]);
t.push(["admin approves salary proposals", String(actionableFor("salary", mk("divya", true, [], []), "rahul", "priya")), "true"]);

// ---- bonus: admin only ----
t.push(["admin approves bonuses", String(actionableFor("bonus", mk("divya", true, [], []), "rahul", "priya")), "true"]);
t.push(["a lead never approves bonuses", String(actionableFor("bonus", mk("priya", false, ["leave_approve", "salary_edit"], ["rahul"]), "rahul", "priya")), "false"]);
t.push(["even an admin can't approve their own bonus proposal", String(actionableFor("bonus", mk("divya", true, [], []), "rahul", "divya")), "false"]);

// ---- expense: finance eyes, never your own claim ----
t.push(["finance approves an expense claim", String(actionableFor("expense", mk("karan", false, ["expense_approve"], []), "rahul", "rahul")), "true"]);
t.push(["payment_record also counts as finance", String(actionableFor("expense", mk("karan", false, ["payment_record"], []), "rahul", "rahul")), "true"]);
t.push(["a lead can't decide expense claims", String(actionableFor("expense", mk("priya", false, ["leave_approve"], ["rahul"]), "rahul", "rahul")), "false"]);
t.push(["finance never approves their OWN claim", String(actionableFor("expense", mk("karan", false, ["expense_approve"], []), "karan", "karan")), "false"]);
t.push(["admin decides expense claims", String(actionableFor("expense", mk("divya", true, [], []), "rahul", "rahul")), "true"]);

// ---- ordering: actionable first, FIFO within ----
const sorted = sortInbox([
  { id: "w1", actionable: false, createdAt: "2026-07-01" },
  { id: "a2", actionable: true, createdAt: "2026-07-20" },
  { id: "a1", actionable: true, createdAt: "2026-07-10" },
  { id: "w2", actionable: false, createdAt: "2026-06-01" },
] as any[]);
t.push(["actionable band comes first", sorted.map((x: any) => x.id).join(","), "a1,a2,w2,w1"]);
t.push(["oldest actionable is on top (FIFO)", sorted[0].id, "a1"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} INBOX RULES CORRECT ***` : `\n*** ${bad} INBOX FAILURE(S) ***`);
