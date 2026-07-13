// scripts/validate-schema.mjs
// Guards against the bug class that cost four deploys: code writing column
// names that do not exist in the database. Builds the true schema from every
// .sql file in the repo (base CREATE TABLE + every ALTER TABLE ADD COLUMN),
// then validates the demo seed and the Records console registry against it.
//
//   node scripts/validate-schema.mjs
//
// Run this after touching any table or any code that writes to one.

import { readFileSync, readdirSync } from "node:fs";

const schema = {};
for (const f of readdirSync(".").filter((f) => f.endsWith(".sql"))) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const cols = (schema[m[1]] ||= new Set());
    for (const line of m[2].split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("--")) continue;
      const c = t.match(/^(\w+)\s+/);
      if (c && !["primary", "unique", "constraint", "foreign", "check"].includes(c[1].toLowerCase())) cols.add(c[1]);
    }
  }
  for (const m of s.matchAll(/alter table (?:public\.)?(\w+)\s+add column (?:if not exists )?(\w+)/gi)) {
    (schema[m[1]] ||= new Set()).add(m[2]);
  }
}

let failed = false;
function check(label, table, keys) {
  const known = schema[table];
  if (!known) { console.log(`WARN ${label}: table "${table}" not found in any .sql file`); return; }
  const bad = [...keys].filter((k) => !known.has(k));
  if (bad.length) { failed = true; console.log(`FAIL ${label} (${table}) -> unknown columns: ${bad.join(", ")}`); }
  else console.log(`OK   ${label} (${table})`);
}

// 1) The demo seed — every insert() batch.
const seed = readFileSync("app/api/demo/route.ts", "utf8");
for (const m of seed.matchAll(/insert\(url, key, "(\w+)", \[([\s\S]*?)\n {4}\]/g)) {
  const body = m[2].replace(/items: \[[\s\S]*?\],/g, "").replace(/payments: \[[\s\S]*?\],/g, "");
  const keys = new Set();
  for (const row of body.match(/\{\s*uid[^\n]*/g) || []) {
    for (const k of row.matchAll(/(\w+):/g)) if (!/^\d+$/.test(k[1])) keys.add(k[1]);
  }
  check(`seed:${m[1]}`, m[1], keys);
}

// 2) The Records console registry — label_field + every editable field.
const reg = readFileSync("lib/objects.ts", "utf8");
for (const m of reg.matchAll(/(\w+):\s*\{ table: "(\w+)"[\s\S]*?label_field: "(\w+)",\s*editable: \[([^\]]*)\]/g)) {
  const keys = new Set([m[3], ...[...m[4].matchAll(/"(\w+)"/g)].map((x) => x[1])]);
  check(`records:${m[1]}`, m[2], keys);
}

console.log(failed ? "\n*** SCHEMA MISMATCH - fix before deploying ***" : "\n*** SCHEMA VALIDATED ***");
process.exit(failed ? 1 : 0);
