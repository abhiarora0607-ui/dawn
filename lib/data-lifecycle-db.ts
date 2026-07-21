// lib/data-lifecycle-db.ts
// The one code path that deletes a business's records.
//
// Clearing demo data and resetting an organisation are the same operation with
// a different scope, so they share this. When the two were separate, the demo
// one silently went stale — it was written when there were six employee-owned
// tables and never updated as the product grew to seventeen, so clearing demo
// data left payslips and leave balances pointing at people who no longer
// existed.

import { OWNED_TABLES, shouldDelete, scopeFilter, CONFIRMATION_ORDER } from "@/lib/data-lifecycle";

function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export type WipeMode = "demo" | "all";

export type WipeResult = {
  deleted: Record<string, number>;
  total: number;
  failed: string[];
};

/**
 * Count what would be destroyed, so the confirmation screen shows real numbers
 * rather than a vague warning. Someone about to wipe 400 records should see
 * "400", not "all your data".
 */
export async function countRecords(
  url: string, key: string, uid: string, mode: WipeMode,
): Promise<{ counts: Record<string, number>; total: number }> {
  const counts: Record<string, number> = {};
  let total = 0;

  // Employee ids first — child tables are reached through them.
  const empFilter = mode === "demo" ? "&is_demo=is.true" : "";
  const emps = await fetch(
    `${url}/rest/v1/employees?uid=eq.${uid}${empFilter}&select=id`,
    { headers: H(key), cache: "no-store" },
  ).then((r) => r.json()).catch(() => []);
  const empIds = (Array.isArray(emps) ? emps : []).map((e: any) => e.id);

  await Promise.all(
    OWNED_TABLES.filter((t) => shouldDelete(mode, t)).map(async (t) => {
      try {
        let q: string;
        if (t.via === "child") {
          if (empIds.length === 0) return;
          q = `${url}/rest/v1/${t.table}?uid=eq.${uid}&employee_id=in.(${empIds.join(",")})&select=id`;
        } else if (t.via === "nested") {
          return;   // counted with its parent — showing both would double-count
        } else {
          q = `${url}/rest/v1/${t.table}?uid=eq.${uid}${scopeFilter(mode, t)}&select=id`;
        }
        const rows = await fetch(q, { headers: H(key, { Prefer: "count=exact" }), cache: "no-store" })
          .then((r) => r.json()).catch(() => []);
        const n = Array.isArray(rows) ? rows.length : 0;
        if (n > 0) { counts[t.table] = n; total += n; }
      } catch { /* a table that doesn't exist yet simply has nothing in it */ }
    }),
  );

  return { counts, total };
}

/**
 * Delete, in dependency order.
 *
 * Sequential rather than parallel: children must be gone before parents, and a
 * race would leave rows whose owner has already been removed — invisible in
 * the UI, still occupying the database, and impossible to find again.
 */
export async function wipeRecords(
  url: string, key: string, uid: string, mode: WipeMode,
  opts: { keepEmployees?: boolean } = {},
): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  const failed: string[] = [];
  let total = 0;

  const empFilter = mode === "demo" ? "&is_demo=is.true" : "";
  const emps = await fetch(
    `${url}/rest/v1/employees?uid=eq.${uid}${empFilter}&select=id,is_owner`,
    { headers: H(key), cache: "no-store" },
  ).then((r) => r.json()).catch(() => []);

  // The owner's own employee record is never deleted — it's how they appear in
  // their own business, and removing it would break attendance and payroll for
  // the one person who can't be re-added from outside.
  const empIds = (Array.isArray(emps) ? emps : [])
    .filter((e: any) => !e.is_owner)
    .map((e: any) => e.id);

  for (const t of OWNED_TABLES) {
    if (!shouldDelete(mode, t)) continue;
    if (opts.keepEmployees && (t.table === "employees" || t.via === "child")) continue;

    try {
      if (t.via === "nested" && t.parent) {
        // Reached through the parent: collect parent ids, then delete by them.
        const parentRows = await fetch(
          `${url}/rest/v1/${t.parent.table}?uid=eq.${uid}&select=id`,
          { headers: H(key), cache: "no-store" },
        ).then((r) => r.json()).catch(() => []);
        const ids = (Array.isArray(parentRows) ? parentRows : []).map((r: any) => r.id);
        if (ids.length === 0) continue;
        const res = await fetch(
          `${url}/rest/v1/${t.table}?uid=eq.${uid}&${t.parent.column}=in.(${ids.join(",")})`,
          { method: "DELETE", headers: H(key, { Prefer: "return=representation" }) },
        );
        const gone = await res.json().catch(() => []);
        const n = Array.isArray(gone) ? gone.length : 0;
        if (n) { deleted[t.table] = n; total += n; }
        continue;
      }

      if (t.via === "child") {
        if (empIds.length === 0) continue;
        const res = await fetch(
          `${url}/rest/v1/${t.table}?uid=eq.${uid}&employee_id=in.(${empIds.join(",")})`,
          { method: "DELETE", headers: H(key, { Prefer: "return=representation" }) },
        );
        const gone = await res.json().catch(() => []);
        const n = Array.isArray(gone) ? gone.length : 0;
        if (n) { deleted[t.table] = n; total += n; }
        continue;
      }

      // Business-owned. The owner's employee row is protected explicitly.
      const guard = t.table === "employees" ? "&is_owner=is.false" : "";
      const res = await fetch(
        `${url}/rest/v1/${t.table}?uid=eq.${uid}${scopeFilter(mode, t)}${guard}`,
        { method: "DELETE", headers: H(key, { Prefer: "return=representation" }) },
      );
      const gone = await res.json().catch(() => []);
      const n = Array.isArray(gone) ? gone.length : 0;
      if (n) { deleted[t.table] = n; total += n; }
    } catch {
      // One table failing must not abort the rest — a half-finished wipe that
      // stopped at the first error is worse than one that completed and
      // reported what it couldn't reach.
      failed.push(t.table);
    }
  }

  return { deleted, total, failed };
}

/** Counts for the confirmation screen, in the order a person thinks of them. */
export function summariseCounts(counts: Record<string, number>): { label: string; table: string; count: number }[] {
  const byTable: Record<string, string> = {};
  for (const t of OWNED_TABLES) byTable[t.table] = t.label;

  const ordered = [
    ...CONFIRMATION_ORDER.filter((t) => counts[t]),
    ...Object.keys(counts).filter((t) => !CONFIRMATION_ORDER.includes(t)),
  ];
  return ordered.map((t) => ({ table: t, label: byTable[t] || t, count: counts[t] }));
}
