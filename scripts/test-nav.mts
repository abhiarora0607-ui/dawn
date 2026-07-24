// V60 nav-registry rules. allowedFor is the single law deciding what each
// actor can see AND reach — the sidebar and the route guard both call it, so
// pinning it here pins both. The Karan case matters most: authority without
// a team (finance approver, zero reports) must still see the Inbox.
import { NAV, allowedFor, matchEntry, employeeNav, type Actor } from "../lib/nav.ts";

const t: [string, any, string][] = [];
const owner: Actor = { kind: "owner" };
const nobody: Actor = { kind: null };
const emp = (over: any = {}): Actor => ({ kind: "employee", name: "T", permissions: [], isAdmin: false, isLead: false, dept: "none", ...over });

const by = (href: string) => NAV.find((e) => e.href === href)!;

// ---- owner scope ----
t.push(["owner sees owner entries", String(allowedFor(owner, by("/dashboard/contacts"))), "true"]);
t.push(["owner sees shared entries", String(allowedFor(owner, by("/dashboard"))), "true"]);
t.push(["owner does NOT see employee-only entries", String(allowedFor(owner, by("/dashboard/my-attendance"))), "false"]);

// ---- employee scope ----
t.push(["an employee never sees owner-only entries", String(allowedFor(emp(), by("/dashboard/contacts"))), "false"]);
t.push(["…including Billing", String(allowedFor(emp({ isAdmin: true }), by("/dashboard/billing"))), "false"]);
t.push(["every employee sees their attendance", String(allowedFor(emp(), by("/dashboard/my-attendance"))), "true"]);
t.push(["every employee sees Help", String(allowedFor(emp(), by("/contact"))), "true"]);
t.push(["studio needs content_tools", String(allowedFor(emp(), by("/dashboard/my-studio"))), "false"]);
t.push(["…and appears with it", String(allowedFor(emp({ permissions: ["content_tools"] }), by("/dashboard/my-studio"))), "true"]);
t.push(["payroll needs salary_view or admin", String(allowedFor(emp(), by("/dashboard/payroll-run"))), "false"]);
t.push(["…admin qualifies", String(allowedFor(emp({ isAdmin: true }), by("/dashboard/payroll-run"))), "true"]);
t.push(["My Team is for leads and admins only", String(allowedFor(emp(), by("/dashboard/my-team"))), "false"]);
t.push(["…a lead qualifies", String(allowedFor(emp({ isLead: true }), by("/dashboard/my-team"))), "true"]);

// ---- the Karan case: inbox = position OR any decide-authority ----
t.push(["a plain employee has no Inbox", String(allowedFor(emp(), by("/dashboard/inbox"))), "false"]);
t.push(["a lead has the Inbox", String(allowedFor(emp({ isLead: true }), by("/dashboard/inbox"))), "true"]);
t.push(["finance authority WITHOUT a team still has the Inbox", String(allowedFor(emp({ permissions: ["expense_approve", "payment_record"] }), by("/dashboard/inbox"))), "true"]);

// ---- signed-out and route matching ----
t.push(["no session, no entries", String(allowedFor(nobody, by("/dashboard"))), "false"]);
t.push(["detail pages inherit their module's rule (longest prefix)", String(matchEntry("/dashboard/contacts/abc-123")?.href), "/dashboard/contacts"]);
t.push(["my-attendance is not swallowed by a shorter prefix", String(matchEntry("/dashboard/my-attendance")?.href), "/dashboard/my-attendance"]);
t.push(["unknown paths match nothing", String(matchEntry("/somewhere/else")), "null"]);
t.push(["a plain employee's workspace nav = home + the universal five (Help lives in the bottom block)", employeeNav(emp()).map((e) => e.href).join(","), "/dashboard,/dashboard/my-attendance,/dashboard/my-leave,/dashboard/pay,/dashboard/expenses,/dashboard/people"]);

let bad = 0;
for (const [name, got, want] of t) {
  const g = String(got);
  if (g === want) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${g}, wanted ${want}`); bad++; }
}
if (bad) { console.log(`\x1b[31m*** ${bad} NAV RULE FAILURE(S) ***\x1b[0m`); process.exit(1); }
console.log(`\x1b[32m*** ALL ${t.length} NAV RULES CORRECT ***\x1b[0m`);
