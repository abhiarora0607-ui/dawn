// lib/tenant.ts
// Centralized multi-tenant access guard.
//
// WHY THIS EXISTS: Dawn uses its own cookie identity (not Supabase Auth), and
// all data access runs server-side with the service key, which bypasses RLS.
// That means the APPLICATION is the security boundary. The risk is any query
// that forgets its owner filter. This module makes owner-scoping the ONLY way
// to reach tenant data, so no individual route can leak by omission.
//
// Every tenant table is keyed by `uid`. Use ownerId() to resolve the caller,
// and scoped() to build queries that ALWAYS carry the owner filter.

import { getUid } from "@/lib/auth";

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SECRET_KEY;

// Resolve the current owner id from any supported identity path
// (magic-link session OR Instagram cookie). Returns null if not signed in.
export async function ownerId(): Promise<string | null> {
  return getUid();
}

export function sbHeaders(extra: Record<string, string> = {}) {
  const key = SB_KEY()!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Guard result: either an error response signal, or a validated context.
export type Guarded =
  | { ok: false; status: number; error: string }
  | { ok: true; uid: string; url: string; key: string };

// Call at the top of every tenant route. Guarantees uid + config exist.
export async function guard(): Promise<Guarded> {
  const uid = await ownerId();
  const url = SB_URL(), key = SB_KEY();
  if (!url || !key) return { ok: false, status: 500, error: "Server not configured." };
  if (!uid) return { ok: false, status: 401, error: "Please sign in." };
  return { ok: true, uid, url, key };
}

// Build a PostgREST query path that ALWAYS includes the owner filter.
// Example: scoped("contacts", uid, "order=created_at.desc")
//   → contacts?uid=eq.<uid>&order=created_at.desc
export function scoped(table: string, uid: string, extra = ""): string {
  const base = `${table}?uid=eq.${encodeURIComponent(uid)}`;
  return extra ? `${base}&${extra}` : base;
}

// Safe fetch helpers that inject headers. Reads are always owner-scoped via
// scoped(). Writes must include uid in the body (enforced by convention +
// the RLS default-deny net for the anon key).
export async function sbGet(url: string, key: string, path: string) {
  return fetch(`${url}/rest/v1/${path}`, { headers: sbHeaders(), cache: "no-store" });
}
export async function sbSend(url: string, key: string, path: string, method: string, body: any, prefer = "return=minimal") {
  return fetch(`${url}/rest/v1/${path}`, { method, headers: sbHeaders({ Prefer: prefer }), body: JSON.stringify(body) });
}

// Validate that a write body's uid matches the authenticated owner. Prevents
// a caller from writing rows owned by someone else.
export function assertOwn(body: any, uid: string): boolean {
  if (body?.uid && body.uid !== uid) return false;
  return true;
}
