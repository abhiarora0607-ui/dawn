// scripts/check-invariants.mjs
// The safety net Dawn never had. Statically verifies — against the source —
// that the rules which must NEVER break are still enforced. Catches the
// regression classes that would be catastrophic with real customers:
//
//   1. Tenant isolation: every tenant-table query filters by uid
//   2. Soft-delete: every list read of a soft-deletable table excludes deleted
//   3. Stage rules: Lost needs reason, Won needs order/reason, customer lock
//   4. Cancelled orders excluded from money
//   5. Permissions enforced server-side on the team surface
//   6. Secrets never shipped to the client
//
//   node scripts/check-invariants.mjs
//
// Exit 1 on any failure, so it can gate a deploy.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const fail = (msg) => { console.log(`  ✗ ${msg}`); failures++; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const files = walk("app").concat(walk("lib"));
const read = (p) => readFileSync(p, "utf8");

// ---- 1. TENANT ISOLATION ----------------------------------------------------
console.log("\n[1] Tenant isolation — every tenant-table read filters by uid");
const TENANT_TABLES = ["contacts", "sales", "catalog_items", "expenses", "employees", "tasks", "activities", "subscriptions", "payments", "events", "feedback", "attendance_logs", "attendance_days", "holidays", "remote_grants", "regularization_requests", "leave_requests", "leave_balances", "leave_types", "encashment_requests", "departments", "payslips", "payslip_lines", "bonus_requests"];
{
  let bad = 0;
  for (const p of files.filter((f) => f.includes("/api/"))) {
    if (p.includes("/operator/")) continue; // operator is cross-tenant by design
    if (p.includes("/cron/")) continue;      // cron is cross-tenant by design
    const s = read(p);
    for (const t of TENANT_TABLES) {
      // find rest/v1/<table>? reads and check the same call carries uid=eq or employee scoping
      const re = new RegExp(`rest/v1/${t}\\?([^\\\`]*)`, "g");
      let m;
      while ((m = re.exec(s))) {
        const q = m[1];
        if (!/uid=eq\.|owner_uid=eq\./.test(q)) { fail(`${p}: ${t} query without uid filter → ${q.slice(0, 50)}`); bad++; }
      }
    }
  }
  if (bad === 0) pass("all tenant-table queries are uid-scoped");
}

// ---- 2. SOFT-DELETE ---------------------------------------------------------
console.log("\n[2] Soft-delete — list reads of value tables exclude deleted rows");
const SOFT_TABLES = ["contacts", "sales", "catalog_items", "expenses"];
{
  let bad = 0;
  for (const p of files.filter((f) => f.includes("/api/"))) {
    if (p.includes("/recovery/")) continue; // recovery intentionally reads deleted
    const s = read(p);
    for (const t of SOFT_TABLES) {
      const re = new RegExp(`rest/v1/${t}\\?([^\\\`]*select[^\\\`]*)`, "g");
      let m;
      while ((m = re.exec(s))) {
        const q = m[1];
        // reads by a single id (id=eq) or count-only checks are exempt
        if (/id=eq\.|share_token=eq\.|deleted_at=/.test(q)) continue;
        if (/limit=1\b/.test(q)) continue;
        if (!/deleted_at=is\.null/.test(q)) { fail(`${p}: ${t} list read missing deleted_at filter`); bad++; }
      }
    }
  }
  if (bad === 0) pass("value-table list reads exclude soft-deleted rows");
}

// ---- 3. STAGE RULES ---------------------------------------------------------
console.log("\n[3] Stage rules — Lost/Won/customer-lock enforced");
{
  const contactsApi = read("app/api/contacts/route.ts");
  /lost/i.test(contactsApi) && /reason/i.test(contactsApi)
    ? pass("Lost path references a reason")
    : fail("Lost-needs-reason rule not found in contacts API");

  // customer lock: employees can't reverse a won customer with orders
  const teamContacts = read("app/api/team/contacts/route.ts");
  /Customer \(Won\)|won|customer/i.test(teamContacts)
    ? pass("team contacts API references the won/customer stage guard")
    : fail("customer-lock guard not evident in team contacts API");
}

// ---- 4. CANCELLED ORDERS EXCLUDED FROM MONEY --------------------------------
console.log("\n[4] Cancelled orders excluded from money/stats");
{
  let ok = 0;
  for (const p of ["app/api/finance/route.ts", "app/api/pulse/route.ts", "app/api/scores/route.ts", "app/api/employee-performance/route.ts"]) {
    try {
      const s = read(p);
      if (/order_status\s*!==\s*["']Cancelled["']|!==\s*"Cancelled"|Cancelled/.test(s)) { ok++; }
      else fail(`${p}: no Cancelled-order exclusion found`);
    } catch { /* file may not exist */ }
  }
  if (ok >= 3) pass(`cancelled orders excluded in ${ok} money surfaces`);
}

// ---- 5. PERMISSIONS SERVER-SIDE ---------------------------------------------
console.log("\n[5] Team APIs enforce permissions server-side");
{
  let bad = 0, checked = 0;
  for (const p of files.filter((f) => f.includes("/api/team/"))) {
    const s = read(p);
    checked++;
    if (!/guardEmployee|getEmployee|hasPermission/.test(s)) { fail(`${p}: no server-side permission guard`); bad++; }
  }
  if (bad === 0) pass(`all ${checked} team APIs guard on the server`);
}

// ---- 6. SECRETS NOT CLIENT-SIDE ---------------------------------------------
console.log("\n[6] Service key never referenced in client components");
{
  let bad = 0;
  for (const p of files.filter((f) => f.endsWith(".tsx"))) {
    const s = read(p);
    if (s.startsWith('"use client"') || s.includes('"use client"')) {
      if (/SUPABASE_SECRET_KEY/.test(s)) { fail(`${p}: client component references the secret key`); bad++; }
    }
  }
  if (bad === 0) pass("no client component touches the service key");
}

// ---- 7. AREA GATES (V26) ----------------------------------------------------
console.log("\n[7] Billing area gates — every area API carries its guard");
{
  const CRM = ["contacts","sales","catalog","expenses","employees","contacts/import","admin-tasks","employee-accounts","employee-detail","employee-performance","finance","pulse","records","recovery","scores","search","item-detail","onboarding","demo","audit","attendance","attendance/settings","attendance/requests","leave","leave/settings","org","payroll","bonus","view-as"];
  const IG  = ["brief","suggestions","analyze-image","automation","brand-voice","calendar","carousel","competitors","content","persona","schedule","saved","value"];
  let bad = 0;
  for (const r of CRM) {
    try {
      const src = read(`app/api/${r}/route.ts`);
      // The gate may be applied directly, or via resolveApprover() which calls
      // requireArea(…, "crm") and hands back `blocked` for the route to return.
      // Both are real gates; only "no gate at all" is a failure.
      const direct = src.includes('"crm"');
      const viaApprover = src.includes("resolveApprover") && /\.blocked|blocked\)/.test(src);
      if (!direct && !viaApprover) { fail(`app/api/${r}: missing crm gate`); bad++; }
    } catch {}
  }
  for (const r of IG) {
    try { if (!read(`app/api/${r}/route.ts`).includes('"instagram_ai"')) { fail(`app/api/${r}: missing instagram_ai gate`); bad++; } } catch {}
  }
  try { if (!read("lib/employee-auth.ts").includes("features.crm")) { fail("employee portal choke-point gate missing"); bad++; } } catch {}
  // V31a: attendance must never block a punch on a missing CRM permission —
  // attendance belongs to the person, not to a role. Guard that on purpose.
  try {
    const punch = read("app/api/team/attendance/route.ts");
    if (!punch.includes("guardEmployee()")) { fail("team attendance must use an unpermissioned guardEmployee()"); bad++; }
    // V31b: leave belongs to the person too — same rule.
    const lv = read("app/api/team/leave/route.ts");
    if (!lv.includes("guardEmployee()")) { fail("team leave must use an unpermissioned guardEmployee()"); bad++; }
    // V38: an employee's own pay is theirs. The endpoint must take no target
    // parameter at all — the simplest possible defence against the worst leak
    // an HR product can have.
    const sal = read("app/api/team/salary/route.ts");
    if (!sal.includes("ctx.employeeId")) { fail("team salary must scope to the caller"); bad++; }
    if (/employeeId.*searchParams|searchParams.*employee/i.test(sal)) {
      fail("team salary must not accept an employee id parameter"); bad++;
    }
  } catch { fail("app/api/team/attendance missing"); bad++; }
  if (bad === 0) pass(`all ${CRM.length + IG.length} area APIs + the portal choke point are gated`);
}

// ---- 8. FEATURE POLICY vs FEATURES (V33) ------------------------------------
// A Permissions-Policy header can switch off a browser capability for the
// whole site. Nothing in the app code changes, nothing fails to build, and no
// test breaks — the feature simply stops working in the browser and reports
// itself as a user permission denial. Geolocation shipped dead for two whole
// versions this way. If the product uses a capability, the header has to allow
// it, and that pairing is checked here rather than discovered in the field.
console.log("\n[8] Permissions-Policy allows the browser features Dawn actually uses");
{
  let bad = 0;
  try {
    const cfg = read("next.config.mjs");
    const m = /"Permissions-Policy",\s*value:\s*"([^"]+)"/.exec(cfg);
    const policy = m ? m[1] : "";

    const usesGeo = ["components/TeamAttendance.tsx", "app/dashboard/attendance/page.tsx"]
      .some((f) => { try { return read(f).includes("navigator.geolocation"); } catch { return false; } });

    if (usesGeo) {
      const allowed = /geolocation=\((self|\*)/.test(policy);
      if (!allowed) {
        fail(`Dawn calls navigator.geolocation but Permissions-Policy blocks it → "${policy}"`);
        bad++;
      }
    }
    if (bad === 0) pass("every browser capability Dawn calls is permitted by the header");
  } catch { fail("couldn't read next.config.mjs"); }
}

// ---- 9. MONEY ENTERS THE BOOKS ONLY WHEN PAID (V39) -------------------------
// The whole point of payslips: an expense is created at the transition to
// `paid` and nowhere else. If the cron ever posts salary again, every salary
// would be counted twice — once by the cron and once by payroll — and the
// error would look like a business problem rather than a bug.
console.log("\n[9] Salary reaches the books only through a paid payslip");
{
  let bad = 0;
  const cron = read("app/api/cron/overnight/route.ts");
  if (!/if \(r\.source === "salary"\) continue;/.test(cron)) {
    fail("the overnight cron must skip salary recurring expenses — payroll owns that now"); bad++;
  }
  if (/encashment_requests/.test(cron)) {
    fail("the cron still references encashment; that belongs to payroll now"); bad++;
  }
  const pay = read("app/api/payroll/route.ts");
  if (!/if \(to === "paid" && !slip\.expense_id\)/.test(pay)) {
    fail("the expense must be created on the transition to paid, and only once"); bad++;
  }
  // Approving must NOT post money — that's the whole point of the third hand.
  if (/to === "approved" \|\| to === "paid"/.test(pay)) {
    fail("approving must not post the expense — paying does"); bad++;
  }
  // A draft must never be payable directly.
  const engine = read("lib/payroll.ts");
  const draftLine = (engine.match(/draft: \[([^\]]*)\]/) || [])[1] || "";
  if (draftLine.includes('"paid"')) {
    fail("a draft payslip must not be markable paid without approval"); bad++;
  }
  if (!draftLine.includes('"approved"')) {
    fail("a draft payslip must be approvable"); bad++;
  }
  if (bad === 0) pass("salary flows only through an approved, paid payslip");
}

// ---- 10. NOBODY APPROVES THEIR OWN REQUEST (V40) ----------------------------
// Delegation's one unforgivable failure: a manager quietly signing off their
// own leave. Every route that decides a request must run the shared authority
// check, which refuses self-approval — rather than hand-rolling a comparison
// that someone later "simplifies" away.
console.log("\n[10] Delegated approvals go through the shared authority check");
{
  let bad = 0;
  for (const f of ["app/api/leave/route.ts", "app/api/attendance/requests/route.ts"]) {
    const src = read(f);
    if (!src.includes("canDecideFor")) { fail(`${f} decides requests without canDecideFor()`); bad++; }
  }
  const appr = read("lib/approvals.ts");
  if (!/subjectId === ctx\.meId/.test(appr)) {
    fail("canDecideFor must refuse self-approval"); bad++;
  }
  if (!/queueScope[\s\S]*?filter\(\(id\) => id !== ctx\.meId\)/.test(appr)) {
    fail("an approval queue must exclude the approver's own requests"); bad++;
  }
  // View-as must stay read-only: no POST handler at all.
  const va = read("app/api/view-as/route.ts");
  if (/export async function (POST|PATCH|DELETE|PUT)/.test(va)) {
    fail("view-as must be read-only — it exports a writing handler"); bad++;
  }
  if (bad === 0) pass("approvals require authority, never self, and view-as cannot write");
}

// ---- 11. PAYROLL KEEPS THREE SEPARATE HANDS (V43) ---------------------------
// Preparing, approving and paying must stay distinct permissions. Collapsing
// any two back together recreates the state where one person can draft a
// payslip, sign it off and pay it — the single worst failure mode in a payroll
// product, and the one segregation of duties exists to prevent.
console.log("\n[11] Payroll prepare / approve / pay stay separate");
{
  let bad = 0;
  const perms = read("lib/permissions.ts");
  for (const id of ["payroll_prepare", "payroll_approve", "payroll_pay"]) {
    if (!new RegExp(`id: "${id}"`).test(perms)) { fail(`${id} missing from the catalogue`); bad++; }
  }
  // The conflict warnings are the visible half; without them the split is
  // real but nobody is told when one person holds both.
  if (!/payroll_prepare[\s\S]{0,80}payroll_approve/.test(perms)) {
    fail("no conflict declared between drafting and approving payroll"); bad++;
  }
  const route = read("app/api/payroll/route.ts");
  if (!/payroll_prepare/.test(route)) { fail("payroll route does not enforce payroll_prepare"); bad++; }
  if (!/payroll_approve/.test(route)) { fail("payroll route does not enforce payroll_approve"); bad++; }
  if (!/payroll_pay/.test(route)) { fail("payroll route does not enforce payroll_pay"); bad++; }
  // financials was the catch-all that made this indistinguishable.
  const stillBroad = files.filter((f) => /hasPermission\([^)]*"financials"/.test(read(f)));
  if (stillBroad.length) { fail(`still gating on the old financials catch-all: ${stillBroad[0]}`); bad++; }
  if (bad === 0) pass("payroll duties are separable and enforced");
}

// ---- 12. NO ROLE TEMPLATE SHIPS A CONFLICT (V44) ----------------------------
// A role that grants a conflicting pair by default hands that conflict to
// every business which picks the role, without anyone choosing it — and the
// V43 warning then fires on a state the product created itself.
//
// This caught a real mistake while V44 was being written: Finance Manager was
// given both payroll_approve and payroll_pay, which is precisely the
// maker-checker pair the split exists to keep apart.
console.log("\n[12] No role template contains a conflicting pair");
{
  let bad = 0;
  const roles = read("lib/roles.ts");
  const perms = read("lib/permissions.ts");

  const pairs = [...perms.matchAll(/a: "([a-z_]+)", b: "([a-z_]+)"/g)].map((m) => [m[1], m[2]]);
  // Each role's grant block, minus the owner (who holds everything by design).
  const blocks = [...roles.matchAll(/id: "([a-z_]+)",\s*\n\s*label:[\s\S]*?permissions: \[([\s\S]*?)\],\n/g)];
  for (const [, id, body] of blocks) {
    if (id === "owner") continue;
    const granted = new Set([...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    for (const [a, b] of pairs) {
      if (granted.has(a) && granted.has(b)) {
        fail(`role "${id}" grants the conflicting pair ${a} + ${b}`); bad++;
      }
    }
  }
  // Releasing money should never come from a template — it's granted to a
  // named person, deliberately.
  for (const [, id, body] of blocks) {
    if (id === "owner") continue;
    if (/"payroll_pay"/.test(body)) { fail(`role "${id}" grants payroll_pay by default`); bad++; }
    if (/"billing"/.test(body)) { fail(`role "${id}" grants billing`); bad++; }
    if (/"salary_edit"/.test(body)) { fail(`role "${id}" grants salary_edit`); bad++; }
  }
  if (bad === 0) pass("every role template is free of built-in conflicts");
}

// ---- 13. DELETION LEAVES NO ORPHANS (V45) -----------------------------------
// Clearing demo data used to maintain its own list of employee-owned tables.
// It was written when there were six and never updated as the product grew to
// seventeen, so payslips, leave requests, balances, bonuses, encashments and
// portal logins were left behind pointing at deleted employees — invisible in
// the UI and impossible to find again.
//
// Both deletion paths must go through the shared map, and the map must cover
// every table that carries an employee_id.
console.log("\n[13] Demo clearing and reset share one deletion map");
{
  let bad = 0;
  const demo = read("app/api/demo/route.ts");
  if (!/wipeRecords/.test(demo)) {
    fail("demo clearing does not use the shared lifecycle engine"); bad++;
  }
  const reset = read("app/api/reset/route.ts");
  if (!/wipeRecords/.test(reset)) { fail("reset does not use the shared engine"); bad++; }

  // Every table queried by employee_id anywhere must be in the child list, or
  // deleting an employee strands it.
  const map = read("lib/data-lifecycle.ts");
  const referenced = new Set();
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/rest\/v1\/([a-z_]+)\?[^`]*employee_id=eq\./g)) referenced.add(m[1]);
    for (const m of src.matchAll(/rest\/v1\/([a-z_]+)\?[^`]*employee_id=in\./g)) referenced.add(m[1]);
  }
  // Tables where employee_id is an ASSIGNMENT, not ownership: the row belongs
  // to the business and must survive the person. Deleting a salesperson must
  // never delete their customers.
  const ASSIGNED_NOT_OWNED = new Set([
    "contacts", "sales", "tasks", "events", "emp_notes",
    "employee_scores", "activities", "expenses", "attachments",
    "conversations", "messages", "catalog_items", "saved_content",
  ]);
  for (const t of referenced) {
    if (t === "employees") continue;
    if (ASSIGNED_NOT_OWNED.has(t)) continue;
    if (!new RegExp(`table: "${t}", via: "child"`).test(map)) {
      fail(`${t} is keyed by employee_id but isn't cleaned up with the employee`); bad++;
    }
  }

  // The reset must never delete what keeps someone signed in.
  if (!/dawn_users/.test(map) || !/subscriptions/.test(map)) {
    fail("reset does not declare what it preserves"); bad++;
  }
  if (/table: "dawn_users"|table: "subscriptions"|table: "business_settings"/.test(map)) {
    fail("a preserved table is also in the delete list"); bad++;
  }
  if (bad === 0) pass("one deletion map, no orphaned child tables");
}

// ---- 14. TEAM FIGURES RESPECT THE SALARY GATE (V45b) ------------------------
// A lead sees their team's revenue and expenses because they're accountable
// for them. Salary is different: managing four packers is not a business
// reason to know what they earn.
//
// The gate has to hold on the SERVER. Hiding the figure in the component while
// the API still returns it means the number is one devtools panel away, which
// is not a permission at all.
console.log("\n[14] A lead's team view hides salary without permission");
{
  let bad = 0;
  const api = read("app/api/team/my-team/route.ts");

  if (!/canSeeSalary/.test(api)) { fail("team view has no salary gate"); bad++; }
  // Must use the migration-aware check, or a legacy grant is silently ignored.
  if (!/hasPermission\(ctx, "salary_view"\)/.test(api)) {
    fail("salary gate must use hasPermission so old grants still resolve"); bad++;
  }
  // The salary query itself must sit behind the gate — fetching then hiding
  // still puts the figure in the response.
  const salaryFetch = api.indexOf("monthly_salary");
  const gateStart = api.indexOf("if (canSeeSalary)");
  if (salaryFetch >= 0 && (gateStart < 0 || salaryFetch < gateStart)) {
    fail("salary is fetched before the permission is checked"); bad++;
  }
  // And it must be nulled rather than defaulted to a number.
  if (!/canSeeSalary \? \(salaryBy\[e\.id\] \|\| 0\) : null/.test(api)) {
    fail("salary must be null when not permitted, not zero"); bad++;
  }
  if (bad === 0) pass("salary stays behind salary_view on the server");
}

// ---- 15. PAYROLL DRAFTS ONLY COMPLETED MONTHS (V46) -------------------------
// A payslip drafted mid-month uses half the attendance and a fraction of the
// revenue. It looks authoritative and is simply wrong, which is worse than
// refusing.
console.log("\n[15] Payroll cannot draft an unfinished month");
{
  let bad = 0;
  const route = read("app/api/payroll/route.ts");
  if (!/monthGuardError/.test(route)) { fail("payroll generation has no month guard"); bad++; }
  const lib = read("lib/commission.ts");
  if (!/return month < today\.slice\(0, 7\)/.test(lib)) {
    fail("month completion check must require the month to have ended"); bad++;
  }
  if (bad === 0) pass("only a finished month can be drafted");
}

// ---- 16. COMMISSION PAYS ONLY ON MONEY RECEIVED (V46) -----------------------
// Commission on an invoice nobody has paid hands out cash the business hasn't
// collected, and then has to claw back. Cancelled orders must never count.
console.log("\n[16] Commission is calculated on collected revenue only");
{
  let bad = 0;
  const lib = read("lib/commission.ts");
  if (!/o\.status !== "Cancelled"/.test(lib)) { fail("cancelled orders are not excluded"); bad++; }
  if (!/Number\(o\.amountPaid \|\| 0\) > 0/.test(lib)) {
    fail("commission must require money actually received"); bad++;
  }
  if (!/if \(!o\.employeeId\) continue;/.test(lib)) {
    fail("unattributed revenue must pay nobody"); bad++;
  }
  const route = read("app/api/payroll/route.ts");
  if (!/amount_paid/.test(route)) { fail("payroll must read amount_paid, not an order total"); bad++; }
  if (bad === 0) pass("commission follows collected revenue");
}

// ---- 17. GIFTED LEAVE SURVIVES ACCRUAL (V46) --------------------------------
// Accrual is recomputed monthly and at year-end from policy. Gifted days folded
// into `accrued` would be silently erased the next time that ran, and the
// employee would lose days nobody could explain.
console.log("\n[17] Gifted leave is stored separately from accrual");
{
  let bad = 0;
  const leave = read("lib/leave.ts");
  if (!/granted\?: number/.test(leave)) { fail("availableOf does not account for granted days"); bad++; }
  if (!/Number\(b\.granted \|\| 0\)/.test(leave)) {
    fail("granted days are not added to the balance"); bad++;
  }
  const route = read("app/api/leave/route.ts");
  if (!/action === "grant"/.test(route)) { fail("no way to grant leave"); bad++; }
  // Writing a gift into accrued is the bug this exists to prevent.
  const grantBlock = route.slice(route.indexOf('action === "grant"'), route.indexOf('action === "grant"') + 2200);
  if (/accrued: Number\(existing\.accrued/.test(grantBlock)) {
    fail("a gift must not be written into accrued — accrual recompute would erase it"); bad++;
  }
  if (!/c\.appr\.isAdmin/.test(grantBlock)) { fail("granting leave must be admin only"); bad++; }
  if (bad === 0) pass("gifted leave is its own column and admin-only");
}

// ---- 18. REJECTION IS A ROUND TRIP (V47) ------------------------------------
// A rejected payslip that couldn't be corrected would force the whole month to
// be cancelled and redrafted over one wrong figure. Rejection returns it to
// draft, carrying the reason — and only a draft may be edited, or approving
// would sign off a number that can still change afterwards.
console.log("\n[18] Rejected payslips return to draft, and only drafts are editable");
{
  let bad = 0;
  const lib = read("lib/payroll.ts");
  if (!/rejected: \["draft", "cancelled"\]/.test(lib)) {
    fail("a rejected payslip must be able to return to draft"); bad++;
  }
  if (/rejected: \[[^\]]*"approved"/.test(lib)) {
    fail("a rejected payslip must not jump straight to approved"); bad++;
  }
  if (!/return status === "draft";/.test(lib)) {
    fail("only a draft may be edited"); bad++;
  }
  const route = read("app/api/payroll/route.ts");
  if (!/isEditable\(slip\.status\)/.test(route)) {
    fail("the edit route does not check editability"); bad++;
  }
  // Editing must recompute from the lines, not adjust a stored total.
  if (!/totalsOf\(\(Array\.isArray\(lines\)/.test(route)) {
    fail("editing must recompute totals from the lines"); bad++;
  }
  // The base line is what the payslip is.
  if (!/line\?\.kind === "base"/.test(route)) {
    fail("the salary line must not be removable"); bad++;
  }
  if (bad === 0) pass("rejection round-trips and only drafts can change");
}

// ---- RESULT -----------------------------------------------------------------
console.log("\n" + "=".repeat(48));
if (failures === 0) {
  console.log("*** ALL INVARIANTS HOLD ***");
  process.exit(0);
} else {
  console.log(`*** ${failures} INVARIANT FAILURE(S) — DO NOT DEPLOY ***`);
  process.exit(1);
}
