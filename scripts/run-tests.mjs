// scripts/run-tests.mjs
// Runs the rule tests for attendance and leave.
//
// Next resolves "@/lib/x"; plain Node doesn't. Rather than bend the source to
// suit the test runner, this stages lib/*.ts into a temp folder with the alias
// rewritten, then runs the suites against that. Source stays idiomatic.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, cpSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";

const STAGE = "/tmp/dawn-test";
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, "lib"), { recursive: true });
mkdirSync(join(STAGE, "scripts"), { recursive: true });

for (const f of readdirSync("lib").filter((f) => f.endsWith(".ts"))) {
  const src = readFileSync(join("lib", f), "utf8").replace(/from "@\/lib\/([a-z-]+)"/g, 'from "./$1.ts"');
  writeFileSync(join(STAGE, "lib", f), src);
}
for (const f of readdirSync("scripts").filter((f) => f.endsWith(".mts"))) {
  cpSync(join("scripts", f), join(STAGE, "scripts", f));
}

let failed = 0;
for (const suite of readdirSync(join(STAGE, "scripts"))) {
  console.log(`\n── ${suite.replace("test-", "").replace(".mts", "")} ──`);
  try {
    const out = execFileSync("node", ["--experimental-strip-types", join(STAGE, "scripts", suite)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.write(out.split("\n").filter((l) => !/ExperimentalWarning|trace-warnings|^\(Use/.test(l)).join("\n"));
    if (/FAILURE/.test(out)) failed++;
  } catch (e) {
    process.stdout.write(String(e.stdout || "") + String(e.stderr || ""));
    failed++;
  }
}
console.log(failed === 0 ? "\n\n*** ALL RULE SUITES PASS ***" : `\n\n*** ${failed} SUITE(S) FAILED ***`);
process.exit(failed === 0 ? 0 : 1);
