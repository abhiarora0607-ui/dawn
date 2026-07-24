// lib/http.ts — the ONE Supabase REST header builder (V61).
//
// This function had 59 file-local twins. Twins drift: one gains a Prefer,
// one loses Content-Type, and six months later a PATCH silently no-ops in
// exactly one route. That bug class retires today — layout gate [12] fails
// the build if a local copy ever grows back.

export function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
