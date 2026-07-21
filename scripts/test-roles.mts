// Role template rules. A role that quietly ships a segregation-of-duties
// conflict is worse than no roles at all — it hands out the conflict by
// default and nobody chose it.
import * as R from "../lib/roles.ts";
import * as P from "../lib/permissions.ts";

const t: [string, any, string][] = [];

// ---- catalogue ----
t.push(["custom is offered", String(R.SELECTABLE_ROLES.some((r) => r.id === "custom")), "true"]);
t.push(["owner is not selectable", String(R.SELECTABLE_ROLES.some((r) => r.id === "owner")), "false"]);
t.push(["nine roles defined", R.ROLES.length + "", "9"]);
t.push(["every role has a description", String(R.ROLES.every((r) => r.description.length > 10)), "true"]);
// every permission a role grants must actually exist
const ghosts = R.ROLES.flatMap((r) => r.permissions.filter((p) => !P.permissionDef(p)));
t.push(["no role grants a ghost permission", ghosts.length + "", "0"]);

// ---- everyone can sign in ----
for (const r of R.SELECTABLE_ROLES.filter((x) => x.id !== "custom")) {
  t.push([`${r.id} can open the portal`, String(R.permissionsForRole(r.id).includes("dashboard")), "true"]);
}
t.push(["custom starts empty", R.permissionsForRole("custom").length + "", "0"]);

// ---- THE IMPORTANT ONE: no role ships a conflict ----
for (const r of R.SELECTABLE_ROLES.filter((x) => x.id !== "custom")) {
  const c = P.conflictsIn(R.permissionsForRole(r.id));
  t.push([`${r.id} has no built-in conflict`, c.length + "", "0"]);
}

// ---- the payroll split is real across roles ----
const acct = R.permissionsForRole("accountant");
const fin = R.permissionsForRole("finance_manager");
t.push(["accountant drafts payroll", String(acct.includes("payroll_prepare")), "true"]);
t.push(["accountant cannot approve it", String(acct.includes("payroll_approve")), "false"]);
t.push(["accountant cannot pay it", String(acct.includes("payroll_pay")), "false"]);
t.push(["finance manager approves", String(fin.includes("payroll_approve")), "true"]);
// Approving and releasing money is the maker-checker pair: no single role
// may hold both, so paying is granted deliberately rather than by template.
t.push(["finance manager does NOT also pay", String(fin.includes("payroll_pay")), "false"]);
t.push(["finance manager does not draft", String(fin.includes("payroll_prepare")), "false"]);
// Prepare and approve are covered by templates; paying is deliberately not,
// so that releasing money is always an explicit grant to a named person.
t.push(["templates cover prepare and approve", String(acct.includes("payroll_prepare") && fin.includes("payroll_approve")), "true"]);
t.push(["no template grants payment release", String(R.SELECTABLE_ROLES.some((r) => R.permissionsForRole(r.id).includes("payroll_pay"))), "false"]);

// ---- HR is not finance ----
const hr = R.permissionsForRole("hr_manager");
t.push(["HR can add employees", String(hr.includes("employee_edit")), "true"]);
t.push(["HR cannot pay them", String(hr.includes("payroll_pay")), "false"]);
t.push(["HR cannot change salaries", String(hr.includes("salary_edit")), "false"]);
t.push(["HR can see salaries", String(hr.includes("salary_view")), "true"]);

// ---- nobody but owner holds billing or salary_edit ----
for (const r of R.SELECTABLE_ROLES) {
  t.push([`${r.id} has no billing`, String(R.permissionsForRole(r.id).includes("billing")), "false"]);
}
t.push(["no selectable role edits salary", String(R.SELECTABLE_ROLES.some((r) => R.permissionsForRole(r.id).includes("salary_edit"))), "false"]);
t.push(["owner holds everything", R.permissionsForRole("owner").length + "", P.PERMISSION_IDS.length + ""]);

// ---- support staff is genuinely minimal ----
const sup = R.permissionsForRole("support_staff");
t.push(["support sees no customers", String(sup.includes("customers")), "false"]);
t.push(["support sees no money", String(sup.includes("finance_view")), "false"]);
t.push(["support can still use the portal", String(sup.includes("dashboard")), "true"]);

// ---- implications resolved ----
t.push(["editing implies seeing in a role", String(R.permissionsForRole("sales_rep").includes("leads")), "true"]);
t.push(["role permissions are deduped", String(new Set(R.permissionsForRole("administrator")).size === R.permissionsForRole("administrator").length), "true"]);

// ---- detection ----
t.push(["exact set detects its role", R.detectRole(R.permissionsForRole("sales_rep")), "sales_rep"]);
t.push(["order doesn't matter", R.detectRole([...R.permissionsForRole("accountant")].reverse()), "accountant"]);
t.push(["a tweaked set is custom", R.detectRole([...R.permissionsForRole("sales_rep"), "finance_view"]), "custom"]);
t.push(["empty is custom", R.detectRole([]), "custom"]);
t.push(["legacy junk is custom", R.detectRole(["dashboard", "leads"]), "custom"]);

// ---- preview: overwrite, not merge ----
const from = R.permissionsForRole("sales_rep");
const pv = R.previewRoleChange(from, "accountant");
t.push(["preview shows what's gained", String(pv.gained.includes("payroll_prepare")), "true"]);
t.push(["preview shows what's lost", String(pv.lost.includes("leads")), "true"]);
t.push(["preview result IS the new role", pv.result.sort().join(",") === R.permissionsForRole("accountant").sort().join(",") ? "exact" : "drifted", "exact"]);
t.push(["overwrite does not accumulate", String(pv.result.includes("customers_edit")), "false"]);
t.push(["kept is the overlap", String(pv.kept.includes("dashboard")), "true"]);
// same role = no change
const same = R.previewRoleChange(R.permissionsForRole("manager"), "manager");
t.push(["same role changes nothing", (same.gained.length + same.lost.length) + "", "0"]);

// ---- department defaults ----
t.push(["Finance → accountant", String(R.defaultRoleForDepartment("Finance")), "accountant"]);
t.push(["Accounts → accountant", String(R.defaultRoleForDepartment("Accounts")), "accountant"]);
t.push(["Sales → sales rep", String(R.defaultRoleForDepartment("Sales")), "sales_rep"]);
t.push(["HR → hr manager", String(R.defaultRoleForDepartment("HR")), "hr_manager"]);
t.push(["Warehouse → support", String(R.defaultRoleForDepartment("Warehouse")), "support_staff"]);
t.push(["case insensitive", String(R.defaultRoleForDepartment("finance")), "accountant"]);
t.push(["unknown department has no default", String(R.defaultRoleForDepartment("Marketing")), "null"]);
t.push(["missing name is safe", String(R.defaultRoleForDepartment(null)), "null"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} ROLE RULES CORRECT ***` : `\n*** ${bad} ROLE FAILURE(S) ***`);
