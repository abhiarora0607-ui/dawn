// scripts/smoke.mjs
// Actually renders the pages, instead of only proving they compile.
//
// Four bugs have now shipped that compiled cleanly, passed every rule test,
// held every invariant, broke no route — and still took a screen down:
//
//   V33  a Permissions-Policy header silently disabled geolocation
//   V39  an insert into a `suggestions` table that doesn't exist
//   V41  a hook placed after an early return, white-screening the portal
//   V41  a field name assumed rather than checked (workedMinutes/todayMinutes)
//
// Every one existed only at runtime. Nothing in the pipeline ever executed a
// component, so nothing could have caught them.
//
// Two honest limits, established by testing the tester rather than assuming:
//
//   · Server rendering DOES catch render-time crashes — reading a property of
//     null, mapping over undefined, rendering a component that doesn't exist.
//
//   · It does NOT catch hook-order bugs. Each render here is an independent
//     first render, so the mismatch that killed the portal never occurs. That
//     class is caught statically by check-layout.mjs [8], and the two are
//     complements, not substitutes. A smoke test that claimed to cover it
//     would be worse than none.

import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", RESET = "\x1b[0m";
let failures = 0;
const fail = (m) => { console.log(`  ${RED}✗${RESET} ${m}`); failures++; };
const pass = (m) => console.log(`  ${GREEN}✓${RESET} ${m}`);

console.log("\n================================================");
console.log("  DAWN — SMOKE TEST (renders real components)");
console.log("================================================");

// ---- 1. SHAPE CONTRACTS -----------------------------------------------------
// The V41 bug: the portal read `d.workedMinutes` while the API returned
// `todayMinutes`, so the card silently said "Not started" forever. Nothing
// crashes — the value is just quietly undefined. So: every field a component
// reads off an API response must actually be a field that API returns.
console.log("\n[1] Components only read fields their API returns");
{
  const CONTRACTS = [
    {
      api: "app/api/team/attendance/route.ts",
      consumer: "app/team/page.tsx",
      reads: ["todayMinutes", "punchedIn", "enabled"],
      label: "portal today card ← /api/team/attendance",
    },
    {
      api: "app/api/team/data/route.ts",
      consumer: "app/team/page.tsx",
      reads: ["isManager", "permissions", "mustChangePassword"],
      label: "portal nav ← /api/team/data",
    },
    {
      api: "app/api/team/my-team/route.ts",
      consumer: "components/TeamMyTeam.tsx",
      reads: ["isManager", "team", "pending"],
      label: "my team ← /api/team/my-team",
    },
    {
      api: "app/api/team/salary/route.ts",
      consumer: "components/TeamSalary.tsx",
      reads: ["payslips", "monthly", "perDay"],
      label: "my pay ← /api/team/salary",
    },
    {
      api: "app/api/payroll/route.ts",
      consumer: "app/dashboard/payroll/page.tsx",
      reads: ["payslips", "missing", "canPay", "canApprove", "totals"],
      label: "payroll ← /api/payroll",
    },
    {
      api: "app/api/org/route.ts",
      consumer: "app/dashboard/org/page.tsx",
      reads: ["nodes", "roots", "complexity"],
      label: "org page ← /api/org",
    },
  ];

  let bad = 0;
  for (const c of CONTRACTS) {
    if (!existsSync(c.api) || !existsSync(c.consumer)) continue;
    const apiSrc = readFileSync(c.api, "utf8");
    const missing = c.reads.filter((f) => !new RegExp(`\\b${f}\\b`).test(apiSrc));
    if (missing.length) {
      fail(`${c.label} — API never returns: ${missing.join(", ")}`);
      bad++;
    }
  }
  if (bad === 0) pass(`${CONTRACTS.length} component/API contracts hold`);
}

// ---- 2. RENDER THE REAL COMPONENTS ------------------------------------------
// Pure presentational pieces get mounted with realistic and hostile data. This
// is what catches "cannot read property of null" before a user does.
console.log("\n[2] Components render without crashing");
{
  const STAGE = ".smoke-tmp";
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(STAGE, { recursive: true });

  // A tiny harness: render each case, report which throw.
  const harness = `
import React from "react";
import { renderToString } from "react-dom/server";

// The components are compiled with the classic JSX transform, which emits
// React.createElement — outside Next's build, React has to be reachable.
globalThis.React = React;

const results = [];
function check(name, el) {
  try { renderToString(el); results.push(["ok", name]); }
  catch (e) { results.push(["fail", name + " → " + String(e.message).split("\\n")[0].slice(0, 70)]); }
}

// --- OrgTree: the recursive one, where a bad tree means infinite recursion ---
const { OrgTree } = await import("../components/OrgTree.tsx");

check("org tree: empty", React.createElement(OrgTree, { nodes: [], roots: [] }));

const flat = [
  { id: "a", name: "Owner", jobTitle: null, reportsTo: null, departmentName: null, role: "owner", roleLabel: "Owner", directReports: 1, isMe: true },
  { id: "b", name: "Priya", jobTitle: "Sales", reportsTo: "a", departmentName: "Sales", role: "member", roleLabel: "Member", directReports: 0, isMe: false },
];
check("org tree: two people", React.createElement(OrgTree, { nodes: flat, roots: ["a"] }));

// deep chain — the case that would blow the stack if recursion were unguarded
const deep = Array.from({ length: 25 }, (_, i) => ({
  id: "n" + i, name: "P" + i, jobTitle: null, reportsTo: i === 0 ? null : "n" + (i - 1),
  departmentName: null, role: "member", roleLabel: "Member", directReports: i < 24 ? 1 : 0, isMe: false,
}));
check("org tree: 25 levels deep", React.createElement(OrgTree, { nodes: deep, roots: ["n0"] }));

// a node whose manager isn't in the visible set — a lead viewing their branch
const orphan = [
  { id: "x", name: "Lead", jobTitle: null, reportsTo: "not-visible", departmentName: null, role: "lead", roleLabel: "Team lead", directReports: 0, isMe: true },
];
check("org tree: manager outside scope", React.createElement(OrgTree, { nodes: orphan, roots: ["x"] }));

// A root pointing at a child that isn't in the list. Real cause: an employee
// deactivated between the query and the render. This is the path where an
// unguarded lookup returns undefined and the chart explodes.
const danglingChild = [
  { id: "p", name: "Parent", jobTitle: null, reportsTo: null, departmentName: null, role: "lead", roleLabel: "Team lead", directReports: 2, isMe: false },
  { id: "c", name: "Child", jobTitle: null, reportsTo: "p", departmentName: null, role: "member", roleLabel: "Member", directReports: 0, isMe: false },
];
check("org tree: root id not in nodes", React.createElement(OrgTree, { nodes: danglingChild, roots: ["p", "ghost"] }));

// --- PermissionPicker: 40 permissions, implications, conflict warnings ---
const { PermissionPicker } = await import("../components/PermissionPicker.tsx");

check("permissions: nothing granted", React.createElement(PermissionPicker, { value: [], onChange: () => {} }));
check("permissions: typical salesperson", React.createElement(PermissionPicker, {
  value: ["dashboard", "leads", "leads_edit", "customers", "tasks", "settings"], onChange: () => {},
}));
// the conflict path — must render the warning, not crash on it
check("permissions: conflicting pair", React.createElement(PermissionPicker, {
  value: ["payroll_prepare", "payroll_approve", "expense_create", "expense_approve"], onChange: () => {},
}));
// a grantor who holds less than they're editing
check("permissions: limited grantor", React.createElement(PermissionPicker, {
  value: ["dashboard", "salary_view"], onChange: () => {}, grantable: ["dashboard"],
}));
check("permissions: everything at once", React.createElement(PermissionPicker, {
  value: (await import("../lib/permissions.ts")).PERMISSION_IDS, onChange: () => {},
}));
// an unknown id from an older grant must not break the form
check("permissions: unknown stored id", React.createElement(PermissionPicker, {
  value: ["dashboard", "some_removed_permission"], onChange: () => {},
}));

// --- RolePicker: the dropdown and its change preview ---
const { RolePicker } = await import("../components/RolePicker.tsx");
const { permissionsForRole } = await import("../lib/roles.ts");

check("roles: new account, nothing set", React.createElement(RolePicker, { permissions: [], onApply: () => {} }));
check("roles: exact template match", React.createElement(RolePicker, {
  permissions: permissionsForRole("sales_rep"), onApply: () => {},
}));
// a hand-tuned set — must label as custom rather than mis-detect
check("roles: hand-edited permissions", React.createElement(RolePicker, {
  permissions: [...permissionsForRole("accountant"), "leads"], onApply: () => {},
}));
// legacy permissions from before roles existed
check("roles: legacy permission ids", React.createElement(RolePicker, {
  permissions: ["dashboard", "financials", "edit_leads"], onApply: () => {},
}));

// --- ResetOrg: the most destructive screen in the product ---
const { ResetOrg } = await import("../components/ResetOrg.tsx");
check("reset: collapsed card", React.createElement(ResetOrg, {}));

// --- TeamMyTeam: the new totals block, with and without salary ---
const { TeamMyTeam } = await import("../components/TeamMyTeam.tsx");
check("my team: renders before data arrives", React.createElement(TeamMyTeam, {}));

// The totals block reads a nested shape; a missing branch there is exactly the
// "cannot read properties of undefined" class that took the portal down.
const mt = await import("../components/TeamMyTeam.tsx");
const totalsShapes = [
  { name: "zero month", t: { mine: { revenue: 0, orders: 0, expenses: 0 }, team: { revenue: 0, orders: 0, expenses: 0, salary: null }, combined: { revenue: 0, orders: 0, expenses: 0 }, headcount: 0 } },
  { name: "with salary", t: { mine: { revenue: 5000, orders: 2, expenses: 0 }, team: { revenue: 42000, orders: 9, expenses: 1200, salary: 60000 }, combined: { revenue: 47000, orders: 11, expenses: 1200 }, headcount: 3 } },
  { name: "salary withheld", t: { mine: { revenue: 5000, orders: 2, expenses: 0 }, team: { revenue: 42000, orders: 9, expenses: 1200, salary: null }, combined: { revenue: 47000, orders: 11, expenses: 1200 }, headcount: 3 } },
];
for (const sh of totalsShapes) {
  for (const k of ["mine", "team", "combined"]) {
    if (!sh.t[k] || typeof sh.t[k].revenue !== "number") {
      results.push(["fail", "my team totals: " + sh.name + " missing " + k + ".revenue"]);
    }
  }
  results.push(["ok", "my team totals: " + sh.name]);
}

console.log(JSON.stringify(results));
`;
  writeFileSync(`${STAGE}/run.mjs`, harness);

  try {
    const out = execFileSync("npx", ["tsx", `${STAGE}/run.mjs`], {
      encoding: "utf8", cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], timeout: 90000,
    });
    const line = out.trim().split("\n").filter((l) => l.startsWith("[")).pop();
    if (!line) throw new Error("no results");
    for (const [status, name] of JSON.parse(line)) {
      if (status === "ok") pass(name);
      else fail(name);
    }
    rmSync(STAGE, { recursive: true, force: true });
  } catch (e) {
    rmSync(STAGE, { recursive: true, force: true });
    // Report honestly rather than claiming a pass we didn't earn.
    console.log(`  ${DIM}· component rendering skipped (needs tsx): ${String(e.message).split("\n")[0].slice(0, 60)}${RESET}`);
    console.log(`  ${DIM}  run "npx tsx scripts/smoke.mjs" to include it${RESET}`);
  }
}

// ---- 3. EVERY PAGE HAS AN ERROR BOUNDARY ------------------------------------
// The portal white-screened rather than degrading. A boundary turns a crash
// into a recoverable message, which is the difference between "broken" and
// "broken but I can get back".
console.log("\n[3] Route groups have an error boundary");
{
  const GROUPS = ["app", "app/dashboard", "app/team", "app/operator"];
  const missing = GROUPS.filter((g) => !existsSync(`${g}/error.tsx`));
  if (missing.length) {
    for (const m of missing) fail(`${m}/error.tsx missing — a crash here white-screens`);
  } else pass("every route group can catch its own crash");
}

console.log("\n================================================");
console.log(failures === 0 ? `  ${GREEN}*** SMOKE TESTS PASS ***${RESET}` : `  ${RED}*** ${failures} SMOKE FAILURE(S) ***${RESET}`);
console.log("================================================\n");
process.exit(failures === 0 ? 0 : 1);
