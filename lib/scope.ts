// lib/scope.ts
// WHOSE rows are these? (V62)
//
// The owner and employee CRM routes were converging on the same question and
// answering it in two dialects: the owner sees the whole business, an
// employee sees their own book. That difference is real and must stay — what
// was accidental was expressing it twice, in filter strings scattered across
// routes, where one forgotten `employee_id=eq.` leaks another rep's pipeline.
//
// So the SCOPE becomes one value, resolved once per request, and every list
// query asks it for its filter. Owners get business scope; employees get
// their own; a lead who should see their team's book gets that — one place to
// change when V63 grows team-scoped reads, instead of nine routes.
//
// This deliberately does NOT merge the routes. The employee route also
// enforces ownership on write, stage-dependent edit permissions, and
// cross-employee duplicate blocking; those rules are load-bearing and stay
// where they are.

export type Scope =
  | { kind: "business"; uid: string }
  | { kind: "own"; uid: string; employeeId: string }
  | { kind: "team"; uid: string; employeeIds: string[] };

/** The PostgREST filter fragment for a scope, always prefixed with `&`.
 *  Business scope adds nothing — the uid filter already bounds it. */
export function scopeFilter(s: Scope): string {
  if (s.kind === "own") return `&employee_id=eq.${encodeURIComponent(s.employeeId)}`;
  if (s.kind === "team") {
    if (s.employeeIds.length === 0) return "&employee_id=is.null&id=is.null"; // matches nothing, safely
    return `&employee_id=in.(${s.employeeIds.map(encodeURIComponent).join(",")})`;
  }
  return "";
}

/** Would this scope admit this row? The same law the filter expresses, in
 *  memory — used to verify writes and to keep the two from drifting. */
export function scopeAdmits(s: Scope, row: { uid?: string; employee_id?: string | null }): boolean {
  if (row.uid && row.uid !== s.uid) return false;
  if (s.kind === "business") return true;
  if (s.kind === "own") return row.employee_id === s.employeeId;
  return !!row.employee_id && s.employeeIds.includes(row.employee_id);
}

/** How a scope describes itself to a person, for empty states and headers. */
export function scopeLabel(s: Scope): string {
  if (s.kind === "business") return "the whole business";
  if (s.kind === "own") return "your own book";
  return "your team's book";
}
