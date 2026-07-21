// Org scope rules. A mistake here is not a broken feature — it is one
// employee seeing another's salary. Every rule gets asserted.
import * as O from "../lib/org.ts";

const t: [string, any, string][] = [];

//        owner
//       /     \
//    alice    bob            alice heads Sales
//    /   \      \
//  carol dan   erin
const E: any[] = [
  { id: "owner", name: "Owner", reports_to: null, department_id: null, is_owner: true, is_admin: true },
  { id: "alice", name: "Alice", reports_to: "owner", department_id: "sales" },
  { id: "bob",   name: "Bob",   reports_to: "owner", department_id: "ops" },
  { id: "carol", name: "Carol", reports_to: "alice", department_id: "sales" },
  { id: "dan",   name: "Dan",   reports_to: "alice", department_id: "sales" },
  { id: "erin",  name: "Erin",  reports_to: "bob",   department_id: "ops" },
  { id: "frank", name: "Frank", reports_to: "carol", department_id: "sales" },
];
const D: any[] = [{ id: "sales", name: "Sales", head_employee_id: "alice" }];
const by = (id: string) => E.find((e) => e.id === id);

// ---- derived roles ----
t.push(["owner is owner", O.roleOf(by("owner"), E, D), "owner"]);
t.push(["dept head beats lead", O.roleOf(by("alice"), E, D), "dept_head"]);
t.push(["has reports = lead", O.roleOf(by("bob"), E, D), "lead"]);
t.push(["has reports at depth = lead", O.roleOf(by("carol"), E, D), "lead"]);
t.push(["no reports = member", O.roleOf(by("frank"), E, D), "member"]);
t.push(["no reports = member (erin)", O.roleOf(by("erin"), E, D), "member"]);

// ---- subtree is recursive, not just direct reports ----
t.push(["alice's subtree includes grandchild", O.subtreeOf("alice", E).sort().join(","), "carol,dan,frank"]);
t.push(["carol sees only frank", O.subtreeOf("carol", E).join(","), "frank"]);
t.push(["frank manages nobody", O.subtreeOf("frank", E).length + "", "0"]);
t.push(["owner subtree is everyone", O.subtreeOf("owner", E).length + "", "6"]);

// ---- visibility ----
t.push(["admin sees all", String(O.visibleEmployeeIds(by("owner"), E, D)), "all"]);
// alice: dept head of sales (alice,carol,dan,frank) ∪ subtree (carol,dan,frank)
t.push(["dept head sees whole dept", (O.visibleEmployeeIds(by("alice"), E, D) as string[]).sort().join(","), "alice,carol,dan,frank"]);
t.push(["lead sees own branch only", (O.visibleEmployeeIds(by("bob"), E, D) as string[]).sort().join(","), "bob,erin"]);
t.push(["member sees only self", (O.visibleEmployeeIds(by("frank"), E, D) as string[]).join(","), "frank"]);
t.push(["bob cannot see alice's team", String(O.canSee(by("bob"), "carol", E, D)), "false"]);
t.push(["alice can see frank (2 levels down)", String(O.canSee(by("alice"), "frank", E, D)), "true"]);

// ---- managing is narrower than seeing ----
t.push(["lead manages own report", String(O.canManage(by("alice"), "carol", E)), "true"]);
t.push(["lead manages 2 levels down", String(O.canManage(by("alice"), "frank", E)), "true"]);
t.push(["nobody manages themselves", String(O.canManage(by("alice"), "alice", E)), "false"]);
t.push(["peer cannot manage peer", String(O.canManage(by("bob"), "alice", E)), "false"]);
t.push(["admin manages anyone", String(O.canManage(by("owner"), "frank", E)), "true"]);

// ---- approval routing ----
t.push(["frank's chain goes up", O.managerChain("frank", E).join(","), "carol,alice,owner"]);
t.push(["nearest manager first", O.managerChain("frank", E)[0], "carol"]);
t.push(["owner has no manager", O.managerChain("owner", E).length + "", "0"]);

// ---- cycles ----
t.push(["self-report is a cycle", String(O.wouldCycle("alice", "alice", E)), "true"]);
t.push(["reporting to own report cycles", String(O.wouldCycle("alice", "frank", E)), "true"]);
t.push(["reporting sideways is fine", String(O.wouldCycle("erin", "alice", E)), "false"]);

// a corrupt row must not hang the request
const LOOP: any[] = [
  { id: "a", name: "A", reports_to: "b", department_id: null },
  { id: "b", name: "B", reports_to: "a", department_id: null },
];
t.push(["existing loop terminates", O.subtreeOf("a", LOOP).length <= 2 ? "safe" : "hang", "safe"]);

// ---- delegation is a subset ----
const ALL = ["leads", "customers", "salary_view", "salary_edit", "billing", "team_view"];
t.push(["admin may grant all but reserved", O.grantablePermissions([], true, ALL).sort().join(","), "customers,leads,salary_view,team_view"]);
t.push(["lead grants only what they hold", O.grantablePermissions(["leads", "team_view"], false, ALL).sort().join(","), "leads,team_view"]);
t.push(["cannot grant unheld permission", String(O.grantablePermissions(["leads"], false, ALL).includes("customers")), "false"]);
t.push(["salary_edit never delegable", String(O.grantablePermissions(["salary_edit"], false, ALL).includes("salary_edit")), "false"]);

// ---- revoke cascades ----
const ACC = [
  { employee_id: "carol", permissions: ["leads", "salary_view"], granted_by: "alice" },
  { employee_id: "frank", permissions: ["leads", "salary_view"], granted_by: "alice" },
  { employee_id: "erin",  permissions: ["salary_view"], granted_by: "bob" },
];
const casc = O.cascadeRevoke("alice", ["salary_view"], E, ACC);
t.push(["cascade reaches whole subtree", casc.length + "", "2"]);
t.push(["cascade strips the permission", casc.find((c) => c.employee_id === "frank")!.permissions.join(","), "leads"]);
t.push(["other manager's grant untouched", String(casc.some((c) => c.employee_id === "erin")), "false"]);

// ---- progressive disclosure ----
t.push(["solo hides departments", String(O.orgComplexity(1).showDepartments), "false"]);
t.push(["solo hides org tree", String(O.orgComplexity(1).showOrgTree), "false"]);
t.push(["small team shows tree", String(O.orgComplexity(5).showOrgTree), "true"]);
t.push(["larger team shows departments", String(O.orgComplexity(12).showDepartments), "true"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} ORG RULES CORRECT ***` : `\n*** ${bad} ORG RULE FAILURE(S) ***`);
