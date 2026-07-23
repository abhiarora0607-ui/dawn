// V51 workspace assembly. This function decides what every employee's home
// looks like, so every persona and every degenerate case is asserted, not
// assumed. The demo org (Divya/Karan/Priya/Sneha…) is the acceptance spec.
import {
  assembleWorkspace, flavorOfDepartment, holds, FALLBACK_CTX,
  type WorkspaceCtx, type WidgetDef,
} from "../lib/workspace.ts";

const t: [string, any, string][] = [];
const ids = (ws: { id: string }[]) => ws.map((w) => w.id).join(",");

const ctx = (over: Partial<WorkspaceCtx>): WorkspaceCtx => ({
  ...FALLBACK_CTX,
  counts: { ...FALLBACK_CTX.counts, ...(over.counts || {}) },
  ...over,
  ...(over.counts ? { counts: { ...FALLBACK_CTX.counts, ...over.counts } } : {}),
});

// ---- department flavor: order-only, degrade to none ----
t.push(["Sales dept → sales", flavorOfDepartment("Sales"), "sales"]);
t.push(["Accounts dept → finance", flavorOfDepartment("Accounts & Payroll"), "finance"]);
t.push(["People Ops → hr", flavorOfDepartment("People Ops"), "hr"]);
t.push(["Customer Support → ops", flavorOfDepartment("Customer Support"), "ops"]);
t.push(["unknown name degrades to none", flavorOfDepartment("Blue Sky Division"), "none"]);
t.push(["missing name degrades to none", flavorOfDepartment(null), "none"]);

// ---- holds(): ANY-of, floor when absent ----
t.push(["no requirement = floor = true", String(holds([], undefined)), "true"]);
t.push(["single perm held", String(holds(["leads"], "leads")), "true"]);
t.push(["any-of satisfied by one", String(holds(["orders"], ["leads", "orders"])), "true"]);
t.push(["any-of denied when none held", String(holds(["tasks"], ["leads", "orders"])), "false"]);

// ---- the floor guarantee: nobody ever gets an empty home ----
const bare = assembleWorkspace(ctx({}));
t.push(["zero-permission employee still has a home", String(bare.length > 0), "true"]);
t.push(["and it's the Today card first", bare[0].id, "today"]);

// A registry with no floor at all: assembly injects one anyway.
const noFloor: WidgetDef[] = [{ id: "x", component: "x", size: "card", perm: "leads", priority: () => 1 }];
t.push(["floor injected even into a floorless registry", assembleWorkspace(ctx({}), noFloor)[0].id, "today"]);

// A widget whose rule THROWS costs that widget, never the page (React #31 lesson).
const throwing: WidgetDef[] = [
  { id: "today", component: "today", size: "hero", priority: () => 100 },
  { id: "bad", component: "bad", size: "card", when: () => { throw new Error("boom"); }, priority: () => 99 },
];
const survived = assembleWorkspace(ctx({}), throwing);
t.push(["throwing widget rule excluded, home survives", String(survived.some((w) => w.id === "bad")), "false"]);
t.push(["…and the rest still renders", survived[0].id, "today"]);

// ---- monotonicity: granting a permission only ever ADDS ----
const before = assembleWorkspace(ctx({ permissions: ["tasks"] }));
const after = assembleWorkspace(ctx({ permissions: ["tasks", "leads"] }));
t.push(["granting leads never removes a widget", String(before.every((w) => after.some((a) => a.id === w.id))), "true"]);
t.push(["granting leads adds the CRM block", String(after.some((w) => w.id === "crm_stats")), "true"]);

// ---- the demo personas ----
// Sneha: sales rep — doer home, no authority cards.
const sneha = assembleWorkspace(ctx({ permissions: ["leads", "orders", "tasks"], dept: "sales", hasScore: true }));
t.push(["rep gets today + crm + score", ids(sneha), "today,crm_stats,my_score"]);
t.push(["sales flavor lifts CRM above score", String(sneha.findIndex((w) => w.id === "crm_stats") < sneha.findIndex((w) => w.id === "my_score")), "true"]);

// Non-sales holder of CRM perms: score outranks CRM (flavor is order-only).
const opsWithCrm = assembleWorkspace(ctx({ permissions: ["leads"], dept: "ops", hasScore: true }));
t.push(["ops flavor keeps score above CRM", String(opsWithCrm.findIndex((w) => w.id === "my_score") < opsWithCrm.findIndex((w) => w.id === "crm_stats")), "true"]);

// Priya: sales lead with two actionable approvals — inbox card leads after Today.
const priya = assembleWorkspace(ctx({
  permissions: ["leads", "orders", "leave_approve", "attendance_approve"],
  isLead: true, teamSize: 2, dept: "sales", hasScore: true,
  counts: { actionableApprovals: 2, teamOnLeaveToday: 1, teamPresentToday: 1, myPendingLeave: 0 },
}));
t.push(["lead sees approvals card", String(priya.some((w) => w.id === "approvals_count")), "true"]);
t.push(["approvals outrank everything but Today", priya[1].id, "approvals_count"]);
t.push(["lead sees team today", String(priya.some((w) => w.id === "team_today")), "true"]);

// The escalated-past lead: has a team but NOT the permission → actionable is 0
// (the server computes it through the same gates), so no dead approvals card.
const escalatedPast = assembleWorkspace(ctx({
  permissions: ["leads"], isLead: true, teamSize: 2, dept: "sales",
  counts: { actionableApprovals: 0, teamOnLeaveToday: 0, teamPresentToday: 2, myPendingLeave: 0 },
}));
t.push(["escalated-past lead: no approvals card", String(escalatedPast.some((w) => w.id === "approvals_count")), "false"]);
t.push(["…but still sees their team", String(escalatedPast.some((w) => w.id === "team_today")), "true"]);

// Karan: finance, NO reports — no team card, no approvals card for leave; his
// finance widgets arrive with their portal surfaces in V52/V53.
const karan = assembleWorkspace(ctx({ permissions: ["reports", "salary_view"], dept: "finance" }));
t.push(["finance member without a team: no team card", String(karan.some((w) => w.id === "team_today")), "false"]);
t.push(["…and a clean floor home meanwhile", karan[0].id, "today"]);

// Divya: admin over the whole org with pending work everywhere.
const divya = assembleWorkspace(ctx({
  permissions: ["leads", "orders", "leave_approve", "attendance_approve"],
  isAdmin: true, isLead: true, teamSize: 8, dept: "none", hasScore: false,
  counts: { actionableApprovals: 3, teamOnLeaveToday: 1, teamPresentToday: 7, myPendingLeave: 0 },
}));
t.push(["admin leads with approvals after Today", divya[1].id, "approvals_count"]);
t.push(["admin sees the org's team card", String(divya.some((w) => w.id === "team_today")), "true"]);

// ---- the payroll widget: capability + attention ----
const karanDrafts = assembleWorkspace(ctx({ permissions: ["salary_view", "payroll_approve"], dept: "finance",
  counts: { actionableApprovals: 0, teamOnLeaveToday: 0, teamPresentToday: 0, myPendingLeave: 0, payrollDrafts: 9 } }));
t.push(["finance with drafts sees the payroll card", String(karanDrafts.some((w) => w.id === "payroll_run")), "true"]);
t.push(["drafts lift payroll right under Today", karanDrafts[1].id, "payroll_run"]);
const cleanFinance = assembleWorkspace(ctx({ permissions: ["salary_view"], dept: "finance" }));
t.push(["finance keeps payroll on a clean run", String(cleanFinance.some((w) => w.id === "payroll_run")), "true"]);
const repDrafts = assembleWorkspace(ctx({ permissions: ["leads"], dept: "sales",
  counts: { actionableApprovals: 0, teamOnLeaveToday: 0, teamPresentToday: 0, myPendingLeave: 0, payrollDrafts: 9 } }));
t.push(["a rep never sees payroll, drafts or not", String(repDrafts.some((w) => w.id === "payroll_run")), "false"]);

// ---- ordering is attention-driven: more approvals → higher priority ----
const p1 = assembleWorkspace(ctx({ isLead: true, teamSize: 1, counts: { actionableApprovals: 1, teamOnLeaveToday: 0, teamPresentToday: 1, myPendingLeave: 0 } }));
const p9 = assembleWorkspace(ctx({ isLead: true, teamSize: 1, counts: { actionableApprovals: 9, teamOnLeaveToday: 0, teamPresentToday: 1, myPendingLeave: 0 } }));
const pr = (ws: any[], id: string) => ws.find((w) => w.id === id)?.priority ?? -1;
t.push(["nine approvals outrank one", String(pr(p9, "approvals_count") > pr(p1, "approvals_count")), "true"]);

// ---- prefs (V54): hide, pin, and the rules that keep them safe ----
const prefRep = { permissions: ["leads"], dept: "sales" as const, hasScore: true };
const noPrefs = assembleWorkspace(ctx(prefRep));
t.push(["no prefs → assembly unchanged", ids(assembleWorkspace(ctx(prefRep), undefined, undefined)), ids(noPrefs)]);
const hiddenCrm = assembleWorkspace(ctx(prefRep), undefined, { hidden: ["crm_stats"] });
t.push(["hiding a widget removes it", String(hiddenCrm.some((w) => w.id === "crm_stats")), "false"]);
t.push(["…and everything else survives", String(hiddenCrm.some((w) => w.id === "my_score")), "true"]);
const hideFloor = assembleWorkspace(ctx(prefRep), undefined, { hidden: ["today"] });
t.push(["the floor can NEVER be hidden", hideFloor[0].id, "today"]);
const pinScore = assembleWorkspace(ctx(prefRep), undefined, { pinned: ["my_score"] });
t.push(["pinning lifts a widget above priority order", pinScore[1].id, "my_score"]);
t.push(["…but Today stays the hero on top", pinScore[0].id, "today"]);
const stale = assembleWorkspace(ctx(prefRep), undefined, { hidden: ["gone_widget"], pinned: ["never_was"] });
t.push(["unknown pref ids are ignored, not fatal", ids(stale), ids(noPrefs)]);

// ---- the studio widget: permission-gated, admin-granted ----
const marketer = assembleWorkspace(ctx({ permissions: ["content_tools"], dept: "sales" }));
t.push(["content_tools holder gets the studio card", String(marketer.some((w) => w.id === "studio")), "true"]);
t.push(["without the grant, no studio", String(assembleWorkspace(ctx({ permissions: ["leads"] })).some((w) => w.id === "studio")), "false"]);

// ---- purity: same ctx twice → identical assembly (View-As correctness) ----
const a = ids(assembleWorkspace(ctx({ permissions: ["leads"], dept: "sales" })));
const b = ids(assembleWorkspace(ctx({ permissions: ["leads"], dept: "sales" })));
t.push(["assembly is pure — View-As is exact", String(a === b), "true"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} WORKSPACE RULES CORRECT ***` : `\n*** ${bad} WORKSPACE FAILURE(S) ***`);
