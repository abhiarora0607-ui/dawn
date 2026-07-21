// Data lifecycle rules. The failure this guards against is silent: rows left
// behind pointing at deleted employees, invisible in the UI and impossible to
// find again.
import * as L from "../lib/data-lifecycle.ts";

const t: [string, any, string][] = [];

// ---- completeness: the actual V44 bug ----
// Every table that hangs off an employee must be in the child list, or
// clearing demo data orphans it.
const MUST_BE_CHILDREN = [
  "attendance_logs", "attendance_days", "regularization_requests", "remote_grants",
  "leave_requests", "leave_balances", "encashment_requests", "bonus_requests",
  "payslips", "employee_accounts", "employee_sessions",
];
for (const tbl of MUST_BE_CHILDREN) {
  t.push([`${tbl} is cleaned up with its employee`, String(L.EMPLOYEE_CHILD_TABLES.includes(tbl)), "true"]);
}

// ---- ordering: children before parents ----
const order = L.OWNED_TABLES.map((x) => x.table);
t.push(["payslip_lines deleted before payslips", String(order.indexOf("payslip_lines") < order.indexOf("payslips")), "true"]);
t.push(["employees deleted last of all", order[order.length - 1], "employees"]);
for (const tbl of L.EMPLOYEE_CHILD_TABLES) {
  t.push([`${tbl} before employees`, String(order.indexOf(tbl) < order.indexOf("employees")), "true"]);
}

// ---- nested tables declare their parent ----
const nested = L.OWNED_TABLES.filter((x) => x.via === "nested");
t.push(["every nested table names its parent", String(nested.every((x) => !!x.parent)), "true"]);
t.push(["nested parents exist in the map", String(nested.every((x) => order.includes(x.parent!.table))), "true"]);

// ---- demo scoping ----
t.push(["demo mode targets tagged tables", String(L.DEMO_TAGGED.includes("contacts")), "true"]);
t.push(["employees are demo-taggable", String(L.DEMO_TAGGED.includes("employees")), "true"]);
// the important safety property: clearing demo must not delete untagged business rows
const untaggedOwn = L.OWNED_TABLES.filter((x) => x.via === "own" && !x.demoTagged);
t.push(["untagged tables are skipped in demo mode", String(untaggedOwn.every((x) => !L.shouldDelete("demo", x))), "true"]);
t.push(["untagged tables ARE deleted in a reset", String(untaggedOwn.every((x) => L.shouldDelete("all", x))), "true"]);
// children are reached by employee id, so they're in scope for demo too
t.push(["child tables in scope for demo", String(L.shouldDelete("demo", L.OWNED_TABLES.find((x) => x.table === "payslips")!)), "true"]);

// ---- filters ----
const contacts = L.OWNED_TABLES.find((x) => x.table === "contacts")!;
t.push(["demo filter targets is_demo", L.scopeFilter("demo", contacts), "&is_demo=is.true"]);
t.push(["reset filter is unrestricted", L.scopeFilter("all", contacts), ""]);
const activities = L.OWNED_TABLES.find((x) => x.table === "activities")!;
t.push(["untagged table gets no demo filter", L.scopeFilter("demo", activities), ""]);

// ---- what survives ----
t.push(["login survives a reset", String(L.RESET_PRESERVES.includes("dawn_users")), "true"]);
t.push(["subscription survives", String(L.RESET_PRESERVES.includes("subscriptions")), "true"]);
t.push(["settings survive", String(L.RESET_PRESERVES.includes("business_settings")), "true"]);
t.push(["audit log survives", String(L.RESET_PRESERVES.includes("audit_log")), "true"]);
// nothing preserved may also be in the delete list
t.push(["preserved tables are never deleted", String(L.RESET_PRESERVES.every((p) => !order.includes(p))), "true"]);

// ---- no duplicates ----
t.push(["no table listed twice", String(new Set(order).size === order.length), "true"]);
t.push(["every entry has a label", String(L.OWNED_TABLES.every((x) => x.label.length > 2)), "true"]);

// ---- the confirmation screen ----
t.push(["confirmation lists real tables", String(L.CONFIRMATION_ORDER.every((c) => order.includes(c))), "true"]);
t.push(["confirmation leads with contacts", L.CONFIRMATION_ORDER[0], "contacts"]);

let bad = 0;
for (const [name, got, want] of t) {
  const ok = String(got) === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name} → ${got}${ok ? "" : ` (want ${want})`}`);
}
console.log(bad === 0 ? `\n*** ALL ${t.length} LIFECYCLE RULES CORRECT ***` : `\n*** ${bad} LIFECYCLE FAILURE(S) ***`);
