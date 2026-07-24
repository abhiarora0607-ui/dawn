// V62 rules: the two laws this version added — WHOSE rows (scope) and HOW
// MANY at a time (keyset paging). Both are pure, so both get pinned here
// rather than discovered in production by a rep seeing someone else's book.
import { scopeFilter, scopeAdmits, scopeLabel, type Scope } from "../lib/scope.ts";
import { pageFilter, pageLimit, takePage, PAGE_SIZE } from "../lib/paging.ts";

const t: [string, any, string][] = [];

// ---- scope: the filter ----
const biz: Scope = { kind: "business", uid: "u1" };
const own: Scope = { kind: "own", uid: "u1", employeeId: "e7" };
const team: Scope = { kind: "team", uid: "u1", employeeIds: ["e7", "e8"] };

t.push(["business scope adds no employee filter", scopeFilter(biz), ""]);
t.push(["own scope filters to the one employee", scopeFilter(own), "&employee_id=eq.e7"]);
t.push(["team scope filters to the list", scopeFilter(team), "&employee_id=in.(e7,e8)"]);
t.push(["an empty team matches NOTHING, never everything", scopeFilter({ kind: "team", uid: "u1", employeeIds: [] }), "&employee_id=is.null&id=is.null"]);
t.push(["every non-empty filter starts with &", String(scopeFilter(own).startsWith("&") && scopeFilter(team).startsWith("&")), "true"]);

// ---- scope: the same law, in memory ----
t.push(["business admits any employee's row", String(scopeAdmits(biz, { uid: "u1", employee_id: "e9" })), "true"]);
t.push(["business refuses another tenant's row", String(scopeAdmits(biz, { uid: "u2", employee_id: "e9" })), "false"]);
t.push(["own admits its own row", String(scopeAdmits(own, { uid: "u1", employee_id: "e7" })), "true"]);
t.push(["own refuses a colleague's row", String(scopeAdmits(own, { uid: "u1", employee_id: "e8" })), "false"]);
t.push(["own refuses an unassigned row", String(scopeAdmits(own, { uid: "u1", employee_id: null })), "false"]);
t.push(["team admits a member's row", String(scopeAdmits(team, { uid: "u1", employee_id: "e8" })), "true"]);
t.push(["team refuses an outsider's row", String(scopeAdmits(team, { uid: "u1", employee_id: "e9" })), "false"]);
t.push(["scopes describe themselves in plain words", scopeLabel(own), "your own book"]);

// ---- paging: limits ----
t.push(["a missing limit uses the page size", String(pageLimit(undefined)), String(PAGE_SIZE)]);
t.push(["garbage limits use the page size", String(pageLimit("abc")), String(PAGE_SIZE)]);
t.push(["a huge limit is clamped", String(pageLimit(100000)), "200"]);
t.push(["a tiny limit is floored", String(pageLimit(1)), "10"]);
t.push(["a sane limit is honoured", String(pageLimit(50)), "50"]);

// ---- paging: the query ----
t.push(["the first page has no cursor clause", pageFilter("created_at", null, 100), "&order=created_at.desc&limit=101"]);
t.push(["a later page seeks past the cursor", pageFilter("created_at", "2026-01-01T00:00:00Z", 100), "&created_at=lt.2026-01-01T00%3A00%3A00Z&order=created_at.desc&limit=101"]);
t.push(["it over-fetches by exactly one to detect more", String(pageFilter("date", null, 25).includes("limit=26")), "true"]);

// ---- paging: splitting the result ----
// Descending timestamps, valid however many rows the case needs.
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, created_at: new Date(Date.UTC(2026, 0, 31) - i * 86400000).toISOString() }));
const full = takePage(rows(101), "created_at", 100);
t.push(["a full page returns exactly the limit", String(full.rows.length), "100"]);
t.push(["…and knows more exist", String(full.meta.hasMore), "true"]);
t.push(["…with the last row as the cursor", full.meta.nextCursor!, full.rows[99].created_at]);
const partial = takePage(rows(40), "created_at", 100);
t.push(["a short page returns everything", String(partial.rows.length), "40"]);
t.push(["…and says there is no more", String(partial.meta.hasMore), "false"]);
t.push(["…with no cursor to follow", String(partial.meta.nextCursor), "null"]);
const exact = takePage(rows(100), "created_at", 100);
t.push(["exactly-a-page is not mistaken for more", String(exact.meta.hasMore), "false"]);
t.push(["an empty result pages cleanly", String(takePage([], "created_at", 100).meta.hasMore), "false"]);

let bad = 0;
for (const [name, got, want] of t) {
  const g = String(got);
  if (g === want) console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  else { console.log(`  \x1b[31m✗\x1b[0m ${name} — got ${g}, wanted ${want}`); bad++; }
}
if (bad) { console.log(`\x1b[31m*** ${bad} SCOPE/PAGING RULE FAILURE(S) ***\x1b[0m`); process.exit(1); }
console.log(`\x1b[32m*** ALL ${t.length} SCOPE & PAGING RULES CORRECT ***\x1b[0m`);
