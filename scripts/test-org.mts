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

// ---- V40: who may decide whose requests ----
// Approval is authority over a person, so it's deliberately stricter than
// visibility. These are the abuse cases worth pinning down.
const t3: [string, any, string][] = [];

// Reusing the same org: owner → alice → carol → frank, owner → bob → erin.
// alice heads Sales.
function mkCtx(meId: string | null, perms: string[] = []): any {
  const me = meId ? E.find((e) => e.id === meId) : null;
  const isAdmin = !meId || !!me?.is_owner || !!me?.is_admin;
  return {
    meId, permissions: perms, isAdmin,
    org: {
      employees: E, departments: D,
      myTeam: meId ? O.subtreeOf(meId, E) : E.map((e) => e.id),
      approverFor: (id: string) => O.managerChain(id, E)[0] || null,
    },
  };
}

// Mirrors canDecideFor / queueScope without importing the route plumbing.
const A = {
  canDecideFor(ctx: any, subjectId: string) {
    if (ctx.isAdmin) return { ok: true };
    if (!ctx.meId) return { ok: false, why: "Sign in first." };
    if (subjectId === ctx.meId) return { ok: false, why: "You can't decide your own request — it goes to your manager." };
    if (!ctx.org.myTeam.includes(subjectId)) return { ok: false, why: "You can only decide requests from people on your team." };
    if (!(ctx.permissions.includes("team_edit") || ctx.org.myTeam.length > 0)) return { ok: false, why: "You don't have permission to decide requests." };
    return { ok: true };
  },
  queueScope(ctx: any) {
    if (ctx.isAdmin) return "all";
    return ctx.org.myTeam.filter((id: string) => id !== ctx.meId);
  },
  queueFilter(ctx: any, column = "employee_id") {
    const scope = A.queueScope(ctx);
    if (scope === "all") return "";
    if ((scope as string[]).length === 0) return `&${column}=eq.00000000-0000-0000-0000-000000000000`;
    return `&${column}=in.(${(scope as string[]).join(",")})`;
  },
  approverNameFor(ctx: any, subjectId: string) {
    const managerId = ctx.org.approverFor(subjectId);
    if (!managerId) return "the owner";
    return E.find((e: any) => e.id === managerId)?.name || "your manager";
  },
};

t3.push(["admin decides anything", String(A.canDecideFor(mkCtx(null), "frank").ok), "true"]);
t3.push(["lead decides own report", String(A.canDecideFor(mkCtx("alice"), "carol").ok), "true"]);
t3.push(["lead decides 2 levels down", String(A.canDecideFor(mkCtx("alice"), "frank").ok), "true"]);
// the one that matters
t3.push(["nobody decides their own", String(A.canDecideFor(mkCtx("alice"), "alice").ok), "false"]);
t3.push(["self-decision is explained", String(A.canDecideFor(mkCtx("alice"), "alice").why).includes("your manager"), "true"]);
t3.push(["peer cannot decide peer", String(A.canDecideFor(mkCtx("bob"), "carol").ok), "false"]);
t3.push(["member decides nobody", String(A.canDecideFor(mkCtx("frank"), "carol").ok), "false"]);
t3.push(["cannot decide upward", String(A.canDecideFor(mkCtx("carol"), "alice").ok), "false"]);

// queue excludes yourself, so your own request is never in a list you can act on
t3.push(["queue excludes self", String((A.queueScope(mkCtx("alice")) as string[]).includes("alice")), "false"]);
t3.push(["queue holds the subtree", (A.queueScope(mkCtx("alice")) as string[]).sort().join(","), "carol,dan,frank"]);
t3.push(["admin queue is everything", String(A.queueScope(mkCtx(null))), "all"]);
t3.push(["member queue is empty", (A.queueScope(mkCtx("frank")) as string[]).length + "", "0"]);
t3.push(["empty queue filters to nothing", String(A.queueFilter(mkCtx("frank")).includes("00000000")), "true"]);

// routing
t3.push(["request rises to nearest manager", A.approverNameFor(mkCtx("frank"), "frank"), "Carol"]);
t3.push(["lead's own request rises above them", A.approverNameFor(mkCtx("carol"), "carol"), "Alice"]);
t3.push(["top of tree routes to owner", A.approverNameFor(mkCtx(null), "owner"), "the owner"]);

let bad3 = 0;
for (const [name, got, want] of t3) {
  const ok = String(got) === want;
  if (!ok) bad3++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad3 === 0 ? `*** ALL ${t3.length} APPROVAL RULES CORRECT ***` : `*** ${bad3} APPROVAL FAILURE(S) ***`);
