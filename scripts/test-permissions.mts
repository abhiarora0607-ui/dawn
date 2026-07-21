// Permission vocabulary rules. Migration errors here are silent — someone
// keeps access nobody meant them to have, and nothing visibly breaks.
import * as P from "../lib/permissions.ts";

const t: [string, any, string][] = [];

// ---- catalogue integrity ----
t.push(["no duplicate ids", String(new Set(P.PERMISSION_IDS).size === P.PERMISSION_IDS.length), "true"]);
t.push(["every permission has a group", String(P.PERMISSIONS.every((p) => !!p.group)), "true"]);
t.push(["every permission has a label", String(P.PERMISSIONS.every((p) => !!p.label)), "true"]);
t.push(["every group is in GROUP_ORDER", String(P.PERMISSIONS.every((p) => P.GROUP_ORDER.includes(p.group))), "true"]);
// an "and" in a label means it should have been two permissions
const vague = P.PERMISSIONS.filter((p) => / and /.test(p.label) && !/^(Add|Create) and edit|^Grant and revoke|^Change departments/.test(p.label));
t.push(["labels name one action", vague.length + "", "0"]);
// every implied id must exist
const badImplies = P.PERMISSIONS.flatMap((p) => (p.implies || []).filter((d) => !P.permissionDef(d)));
t.push(["implications point at real permissions", badImplies.length + "", "0"]);

// ---- the finance split ----
t.push(["financials is gone", String(P.PERMISSION_IDS.includes("financials")), "false"]);
for (const id of ["finance_view", "expense_view", "expense_create", "expense_approve", "payment_record"]) {
  t.push([`${id} exists`, String(P.PERMISSION_IDS.includes(id)), "true"]);
}
// the gap the research named
t.push(["payroll_prepare now exists", String(P.PERMISSION_IDS.includes("payroll_prepare")), "true"]);
t.push(["payroll has three separate hands", ["payroll_prepare","payroll_approve","payroll_pay"].filter((x) => P.PERMISSION_IDS.includes(x)).length + "", "3"]);

// ---- implication ----
t.push(["editing implies seeing", P.expandImplied(["leads_edit"]).sort().join(","), "leads,leads_edit"]);
t.push(["salary_edit implies salary_view", String(P.expandImplied(["salary_edit"]).includes("salary_view")), "true"]);
t.push(["implication is transitive", String(P.expandImplied(["org_manage"]).includes("org_view")), "true"]);
t.push(["expansion keeps originals", String(P.expandImplied(["tasks"]).join(",")), "tasks"]);
t.push(["removing a base removes dependents", P.cascadeRemoval(["leads","leads_edit"], "leads").join(","), ""]);
t.push(["removing a dependent keeps the base", P.cascadeRemoval(["leads","leads_edit"], "leads_edit").join(","), "leads"]);

// ---- conflicts ----
t.push(["prepare+approve conflicts", P.conflictsIn(["payroll_prepare","payroll_approve"]).length + "", "1"]);
t.push(["approve+pay conflicts", P.conflictsIn(["payroll_approve","payroll_pay"]).length + "", "1"]);
t.push(["create+approve expense conflicts", P.conflictsIn(["expense_create","expense_approve"]).length + "", "1"]);
t.push(["prepare alone is fine", P.conflictsIn(["payroll_prepare"]).length + "", "0"]);
t.push(["unrelated pair is fine", P.conflictsIn(["tasks","calendar"]).length + "", "0"]);
t.push(["owner holding everything is reported", String(P.conflictsIn(P.PERMISSION_IDS).length >= 5), "true"]);
t.push(["conflict explains itself", String(P.conflictsIn(["payroll_prepare","payroll_approve"])[0].why.length > 30), "true"]);
t.push(["conflict carries labels", P.conflictsIn(["expense_create","expense_approve"])[0].labels[0], "Record an expense"]);
// live warning while granting
t.push(["adding the second half warns", P.conflictsAdding(["payroll_approve"], "payroll_pay").length + "", "1"]);
t.push(["adding an unrelated one doesn't", P.conflictsAdding(["payroll_approve"], "tasks").length + "", "0"]);
t.push(["order doesn't matter", P.conflictsAdding(["payroll_pay"], "payroll_approve").length + "", "1"]);

// ---- migration ----
const oldSales = ["dashboard","leads","customers","edit_leads","tasks","settings"];
const newSales = P.migratePermissions(oldSales);
t.push(["migration keeps portal access", String(newSales.includes("dashboard")), "true"]);
t.push(["migration maps edit_leads", String(newSales.includes("leads_edit")), "true"]);
t.push(["migration expands implications", String(newSales.includes("leads")), "true"]);
t.push(["migration drops nothing else", String(newSales.includes("tasks") && newSales.includes("settings")), "true"]);

// the deliberate reduction
const oldFin = ["dashboard","financials"];
const newFin = P.migratePermissions(oldFin);
t.push(["financials becomes view-only", newFin.filter((p) => p !== "dashboard").sort().join(","), "expense_view,finance_view"]);
t.push(["financials does NOT grant recording", String(newFin.includes("expense_create")), "false"]);
t.push(["financials does NOT grant payment", String(newFin.includes("payment_record")), "false"]);

// V38 org permissions survive
t.push(["salary_view survives", String(P.migratePermissions(["salary_view"]).includes("salary_view")), "true"]);
t.push(["team_edit expands", P.migratePermissions(["team_edit"]).sort().join(","), "team_edit,team_view"]);
t.push(["already-new is left alone", P.migratePermissions(["payroll_prepare"]).join(","), "payroll_prepare"]);
t.push(["unknown ids are dropped", P.migratePermissions(["nonsense_permission"]).length + "", "0"]);
t.push(["migration is idempotent", P.migratePermissions(P.migratePermissions(oldSales)).sort().join(",") === newSales.sort().join(",") ? "same" : "drifted", "same"]);

// ---- legacy aliases keep unmigrated routes working ----
t.push(["financials answered by finance_view", String(P.satisfies(["finance_view"], "financials")), "true"]);
t.push(["edit_leads answered by leads_edit", String(P.satisfies(["leads_edit"], "edit_leads")), "true"]);
t.push(["alias doesn't grant unrelated", String(P.satisfies(["finance_view"], "payment_record")), "false"]);
t.push(["direct match still works", String(P.satisfies(["tasks"], "tasks")), "true"]);

// ---- never delegated ----
t.push(["salary_edit never delegated", String(P.NEVER_DELEGATED.includes("salary_edit")), "true"]);
t.push(["billing never delegated", String(P.NEVER_DELEGATED.includes("billing")), "true"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} PERMISSION RULES CORRECT ***` : `\n*** ${bad} PERMISSION FAILURE(S) ***`);
