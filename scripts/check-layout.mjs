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

// ---- 8. NO HOOKS AFTER AN EARLY RETURN --------------------------------------
// React requires hooks to run in the same order on every render. A hook placed
// after an `if (loading) return` never registers on the first pass, then
// appears once data arrives — "rendered more hooks than during the previous
// render", and the whole page white-screens.
//
// This shipped in V41 and took the employee portal down. It compiled cleanly,
// passed every test, and broke no route: exactly the class of failure these
// checks exist for.
console.log("\n[8] No hooks placed after an early return");
{
  let bad = 0;
  for (const f of files) {
    const lines = read(f).split("\n");
    let depth = 0, guardLine = -1, fnStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^(export )?(default )?function [A-Z]/.test(l)) { fnStart = i; guardLine = -1; }
      // a bare `return null` / `return <…>` at function top level
      if (fnStart >= 0 && guardLine < 0 && /^\s{2}if \([^)]*\) return /.test(l)) guardLine = i;
      if (guardLine >= 0 && /^\s{2}const .*= use[A-Z]\w*(<[^>]*>)?\(/.test(l)) {
        fail(`${f}:${i + 1} hook after an early return — it won't run on every render`);
        bad++; guardLine = -1;
      }
      if (guardLine >= 0 && /^\s{2}use[A-Z]\w*(<[^>]*>)?\(/.test(l)) {
        fail(`${f}:${i + 1} hook after an early return — it won't run on every render`);
        bad++; guardLine = -1;
      }
    }
  }
  if (bad === 0) pass("every hook runs unconditionally");
}

// ---- 9. NO UNGUARDED ARRAY ACCESS ON API DATA (V48a) ------------------------
// The crash class behind the V41 portal white-screen and the My Team crash:
// a component calls d.rows.map() where the API returned { error } and there's
// no guard. The fix was the useApi hook, which makes the guarded path the only
// path. This check keeps it that way — it fails when a file reaches into API
// data with .map/.filter/.reduce while still on the old ungated pattern.
//
// The rule is deliberately narrow to avoid false alarms: it only fires when a
// file BOTH does d.<field>.<array-method>() without optional chaining AND has
// no error guard (useApi's error branch, or an explicit d.error / state.error
// check). A file on useApi with an error branch is trusted; a file still doing
// useState(null)+fetch without a guard is not.
console.log("\n[9] No unguarded array access on API data");
{
  let bad = 0;
  for (const f of files) {
    const src = read(f);

    // A file is considered guarded if it either uses the hook's error state or
    // checks an error field before rendering.
    const hasErrorGuard = /state\.error|\.error\b.*return|if \(d\??\.error\)|billing\.error|detail\.error/.test(src);
    const usesHook = /useApi[(<]/.test(src);

    for (const m of src.matchAll(/\bd\.([a-zA-Z_]+)\.(map|filter|reduce)\b/g)) {
      const at = m.index;
      // optional-chained access is always safe
      if (src.slice(at, at + 60).includes("?.")) continue;
      // a guarded expression on the same line: d.x && / d.x?.length
      const lineStart = src.lastIndexOf("\n", at);
      const line = src.slice(lineStart, src.indexOf("\n", at));
      if (line.includes(`d.${m[1]} &&`) || line.includes(`d.${m[1]}?.`)) continue;
      if (line.includes(`d.${m[1]}.length === 0 ?`) || line.includes(`d.${m[1]}.length > 0 &&`)) continue;
      // a wrapping guard just above: {d.x?.length > 0 && ( ... d.x.map
      // JSX often opens the guard a few lines before the .map inside it.
      const above = src.slice(Math.max(0, at - 240), at);
      if (new RegExp(`d\\.${m[1]}\\?\\.length\\s*(>\\s*0\\s*&&|===\\s*0\\s*\\?)`).test(above)) continue;
      if (new RegExp(`d\\.${m[1]}\\s*&&`).test(above)) continue;
      // trusted if the file has a real error guard AND uses the hook (so d is
      // only bound after loading/error are handled)
      if (hasErrorGuard && usesHook) continue;

      const ln = src.slice(0, at).split("\n").length;
      fail(`${f}:${ln} d.${m[1]}.${m[2]}() with no error guard — use useApi so { error } can't crash the render`);
      bad++;
    }
  }
  if (bad === 0) pass("every array access on API data is guarded");
}

console.log("\n================================================");
console.log(failures === 0 ? `  ${GREEN}*** LAYOUT CHECKS PASS ***${RESET}` : `  ${RED}*** ${failures} LAYOUT FAILURE(S) ***${RESET}`);
console.log("================================================\n");
process.exit(failures === 0 ? 0 : 1);
