// scripts/check-layout.mjs
// Design-system drift guard.
//
// V33 taught the lesson: a bug can compile cleanly, pass every test, break no
// route, and still ship broken — the Permissions-Policy header disabled
// geolocation for two whole versions with nothing to catch it. Visual and
// layout regressions are the same category. Nothing fails when a card is
// hand-rolled or a font drops to 10px; the product just gets slightly worse,
// invisibly, until someone notices months later.
//
// So the rules that matter get asserted. Run: node scripts/check-layout.mjs

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const RED = "\x1b[31m", GREEN = "\x1b[32m", DIM = "\x1b[2m", RESET = "\x1b[0m";
let failures = 0;
const fail = (m) => { console.log(`  ${RED}✗${RESET} ${m}`); failures++; };
const pass = (m) => console.log(`  ${GREEN}✓${RESET} ${m}`);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === "node_modules" || f === ".next" || f.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith(".tsx")) out.push(p);
  }
  return out;
}
const files = [...walk("app"), ...walk("components")];
const read = (f) => readFileSync(f, "utf8");

console.log("\n================================================");
console.log("  DAWN — LAYOUT & DESIGN SYSTEM CHECKS");
console.log("================================================");

// ---- 1. READABLE TYPE -------------------------------------------------------
// Anything under 12px is uncomfortable on a phone and reads as clutter.
console.log("\n[1] No text below 12px");
{
  const offenders = [];
  for (const f of files) {
    const hits = (read(f).match(/text-\[(\d+)px\]/g) || [])
      .filter((m) => Number(m.match(/(\d+)/)[1]) < 12);
    if (hits.length) offenders.push(`${f} (${hits.length})`);
  }
  if (offenders.length) {
    fail(`${offenders.length} file(s) still use sub-12px text`);
    offenders.slice(0, 6).forEach((o) => console.log(`      ${DIM}${o}${RESET}`));
    if (offenders.length > 6) console.log(`      ${DIM}…and ${offenders.length - 6} more${RESET}`);
  } else pass("all text is 12px or larger");
}

// ---- 2. TABLES ARE SCROLLABLE ----------------------------------------------
// A table wider than the viewport with no wrapper just looks broken.
console.log("\n[2] Every table can scroll on a narrow screen");
{
  const bad = [];
  for (const f of files) {
    const s = read(f);
    if (!s.includes("<table")) continue;
    if (!s.includes("dawn-table-wrap") && !s.includes("overflow-x-auto")) bad.push(f);
  }
  if (bad.length) { bad.forEach((f) => fail(`${f}: <table> with no scroll container`)); }
  else pass("every table sits in a scroll container");
}

// ---- 3. NO UNBOUNDED FIXED WIDTHS ------------------------------------------
// A fixed width beyond a phone viewport forces the whole page sideways.
console.log("\n[3] No fixed widths that overflow a phone");
{
  const bad = [];
  for (const f of files) {
    for (const m of read(f).match(/(?<!max-)w-\[(\d{3,})px\]/g) || []) {
      if (Number(m.match(/(\d+)/)[1]) > 340) bad.push(`${f} → ${m}`);
    }
  }
  if (bad.length) { bad.slice(0, 8).forEach((b) => fail(b)); }
  else pass("no element is pinned wider than a phone");
}

// ---- 4. INPUTS ARE STYLED ---------------------------------------------------
// `.inp` was used 95 times and defined nowhere, so every one of those fields
// rendered as a raw browser default. If the class is used, it must exist.
console.log("\n[4] Utility classes used in markup actually exist");
{
  const css = readFileSync("app/globals.css", "utf8");
  const used = new Set();
  for (const f of files) {
    for (const m of read(f).match(/className="[^"]*"/g) || []) {
      for (const c of m.match(/\b(inp|dawn-[a-z-]+|btn|btn-[a-z]+|pill|pill-[a-z]+|t-[a-z]+)\b/g) || []) used.add(c);
    }
  }
  const missing = [...used].filter((c) => !css.includes(`.${c}`));
  if (missing.length) missing.forEach((c) => fail(`.${c} is used in markup but not defined in globals.css`));
  else pass(`all ${used.size} system classes referenced in markup are defined`);
}

// ---- 5. TAP TARGETS ---------------------------------------------------------
console.log("\n[5] Icon buttons are thumb-sized");
{
  let tiny = 0;
  for (const f of files) {
    for (const m of read(f).match(/<button[^>]*className="[^"]*"/g) || []) {
      if (/\bp-1(\.5)?\b/.test(m) && !/btn-icon|min-h|h-\d{2}/.test(m)) tiny++;
    }
  }
  if (tiny > 0) fail(`${tiny} icon button(s) under 44px — use .btn-icon so a thumb can hit them`);
  else pass("every icon button has a 44px hit area");
}

// ---- 6. .btn-icon BELONGS TO BUTTONS ---------------------------------------
// The V35/V36 tap-target sweep matched any element with tight padding, which
// caught the wrapper <div>s of segmented controls. A container is not a tap
// target — giving it a 44px min-height and a hover background is simply wrong.
// Cheap to check, and it caught five real cases.
console.log("\n[6] .btn-icon only on interactive elements");
{
  const bad = [];
  for (const f of files) {
    for (const m of read(f).match(/<(\w+)[^>]*className="[^"]*btn-icon[^"]*"/g) || []) {
      const tag = m.match(/<(\w+)/)[1];
      if (!["button", "a", "Link"].includes(tag)) bad.push(`${f} → <${tag}>`);
    }
  }
  if (bad.length) bad.slice(0, 6).forEach((b) => fail(`btn-icon on a non-interactive element: ${b}`));
  else pass("btn-icon is only used on buttons and links");
}

// ---- 7. ICON-ONLY CONTROLS HAVE NAMES ---------------------------------------
// A button with no text is announced as just "button". Reported rather than
// fatal: a handful legitimately sit beside visible text.
console.log("\n[7] Icon-only controls have accessible names");
{
  let unlabelled = 0;
  for (const f of files) {
    for (const m of read(f).match(/<(?:button|a)\b(?:(?!<\/(?:button|a)>).)*?btn-icon(?:(?!<\/(?:button|a)>).)*?<\/(?:button|a)>/gs) || []) {
      if (!/aria-label|title=/.test(m) && !/>[A-Za-z]{2,}/.test(m.replace(/<[^>]+>/g, ""))) unlabelled++;
    }
  }
  if (unlabelled > 0) console.log(`  ${DIM}· ${unlabelled} icon-only control(s) without an aria-label${RESET}`);
  else pass("every icon-only control has an accessible name");
}

console.log("\n================================================");
console.log(failures === 0 ? `  ${GREEN}*** LAYOUT CHECKS PASS ***${RESET}` : `  ${RED}*** ${failures} LAYOUT FAILURE(S) ***${RESET}`);
console.log("================================================\n");
process.exit(failures === 0 ? 0 : 1);
