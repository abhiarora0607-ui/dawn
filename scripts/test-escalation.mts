// V48b escalation rules. This decides, for every request in the company, who
// can approve it — so every branch is asserted rather than reasoned about once.
import { escalateApprover, canDecideWith } from "../lib/approvals.ts";

const t: [string, any, string][] = [];

// Tree:  owner(admin) → alice(lead) → bob(lead) → carol, dan
//                     → eve(lead, no perms)
const EMP = [
  { id: "owner", reports_to: null, is_owner: true },
  { id: "alice", reports_to: "owner" },
  { id: "bob", reports_to: "alice" },
  { id: "carol", reports_to: "bob" },
  { id: "dan", reports_to: "bob" },
  { id: "eve", reports_to: "owner" },
];
// who holds leave_approve
const PERMS: Record<string, string[]> = {
  alice: ["leave_approve"],
  bob: ["leave_approve"],
  eve: [],            // a lead with no approval permission
  carol: [], dan: [],
};
const permsOf = (id: string) => PERMS[id] || [];
const esc = (subject: string, perm = "leave_approve") => escalateApprover(subject, EMP, permsOf, perm);

// ---- basic climb ----
t.push(["carol's request goes to bob", esc("carol").approverId, "bob"]);
t.push(["dan's request goes to bob", esc("dan").approverId, "bob"]);
// bob holds the permission, so bob is the approver for his reports

// ---- a lead's OWN request rises past themselves ----
// bob is a lead with leave_approve, but his OWN request can't be self-approved;
// it climbs to alice (who also holds it)
t.push(["bob's own request rises to alice", esc("bob").approverId, "alice"]);
t.push(["bob never approves himself", String(esc("bob").approverId !== "bob"), "true"]);
// alice's own request rises to owner (admin backstop)
t.push(["alice's own request rises to owner", esc("alice").approverId, "owner"]);

// ---- skipping someone who lacks the permission ----
// Give carol a report (frank) but carol has no leave_approve.
const EMP2 = [...EMP, { id: "frank", reports_to: "carol" }];
const esc2 = (s: string) => escalateApprover(s, EMP2, permsOf, "leave_approve");
// frank → carol (no perm) → bob (has perm). Skips carol.
t.push(["frank skips carol (no perm) to bob", esc2("frank").approverId, "bob"]);
t.push(["chain records the skip", esc2("frank").chain.join(">"), "carol>bob"]);

// ---- eve: a lead with no permission and no qualified manager below owner ----
// eve reports to owner directly; her report's request climbs eve (skip) → owner
const EMP3 = [...EMP, { id: "grace", reports_to: "eve" }];
const esc3 = (s: string) => escalateApprover(s, EMP3, permsOf, "leave_approve");
t.push(["grace skips permissionless eve to owner", esc3("grace").approverId, "owner"]);

// ---- admin is the backstop when nobody qualifies ----
const NOPERMS: Record<string, string[]> = {};
const escNone = (s: string) => escalateApprover(s, EMP, () => [], "leave_approve");
t.push(["nobody qualified → owner backstop", escNone("carol").approverId, "owner"]);

// ---- collapse case: subject reports directly to admin ----
// eve → owner. eve's own request: climb from eve → owner. First above is owner.
t.push(["report-to-admin lands on admin", esc("eve").approverId, "owner"]);

// ---- cycle guard: broken reports_to must not hang ----
const CYCLE = [
  { id: "x", reports_to: "y" },
  { id: "y", reports_to: "x" },   // a loop
];
const escCycle = escalateApprover("x", CYCLE, () => [], "leave_approve");
t.push(["cycle terminates without hanging", String(escCycle.approverId === null || typeof escCycle.approverId === "string"), "true"]);

// ---- canDecideWith: the gate itself ----
const mk = (meId: string, isAdmin: boolean, perms: string[], team: string[]) => ({
  uid: "u", url: "", key: "", meId, permissions: perms, isAdmin,
  org: { myTeam: team } as any,
});
// bob with leave_approve deciding carol (on his team): ok
t.push(["holder decides team member", String(canDecideWith(mk("bob", false, ["leave_approve"], ["carol", "dan"]), "carol", "leave_approve").ok), "true"]);
// bob without leave_approve: denied, escalates
t.push(["non-holder can't decide", String(canDecideWith(mk("bob", false, [], ["carol"]), "carol", "leave_approve").ok), "false"]);
// bob deciding his OWN request: denied
t.push(["nobody decides their own", String(canDecideWith(mk("bob", false, ["leave_approve"], ["carol"]), "bob", "leave_approve").ok), "false"]);
// bob deciding someone not on his team: denied
t.push(["can't decide off-team", String(canDecideWith(mk("bob", false, ["leave_approve"], ["carol"]), "stranger", "leave_approve").ok), "false"]);
// admin decides anyone
t.push(["admin decides anyone", String(canDecideWith(mk("owner", true, [], []), "carol", "leave_approve").ok), "true"]);

// ---- the permission is per-kind ----
// someone with leave_approve but not attendance_approve
t.push(["leave holder can't approve attendance", String(canDecideWith(mk("bob", false, ["leave_approve"], ["carol"]), "carol", "attendance_approve").ok), "false"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} ESCALATION RULES CORRECT ***` : `\n*** ${bad} ESCALATION FAILURE(S) ***`);
