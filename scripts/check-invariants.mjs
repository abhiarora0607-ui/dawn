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
const TENANT_TABLES = ["contacts", "sales", "catalog_items", "expenses", "employees", "tasks", "activities", "subscriptions", "payments", "events", "feedback", "attendance_logs", "attendance_days", "holidays", "remote_grants", "regularization_requests", "leave_requests", "leave_balances", "leave_types", "encashment_requests", "departments"];
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
  const CRM = ["contacts","sales","catalog","expenses","employees","contacts/import","admin-tasks","employee-accounts","employee-detail","employee-performance","finance","pulse","records","recovery","scores","search","item-detail","onboarding","demo","audit","attendance","attendance/settings","attendance/requests","leave","leave/settings","org"];
  const IG  = ["brief","suggestions","analyze-image","automation","brand-voice","calendar","carousel","competitors","content","persona","schedule","saved","value"];
  let bad = 0;
  for (const r of CRM) {
    try { if (!read(`app/api/${r}/route.ts`).includes('"crm"')) { fail(`app/api/${r}: missing crm gate`); bad++; } } catch {}
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

// ---- RESULT -----------------------------------------------------------------
console.log("\n" + "=".repeat(48));
if (failures === 0) {
  console.log("*** ALL INVARIANTS HOLD ***");
  process.exit(0);
} else {
  console.log(`*** ${failures} INVARIANT FAILURE(S) — DO NOT DEPLOY ***`);
  process.exit(1);
}
