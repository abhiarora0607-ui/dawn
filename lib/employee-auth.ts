// lib/employee-auth.ts
// Employee session resolution + RBAC. An employee logs in with login_id +
// password, gets an opaque session token (cookie `dawn_emp`), and operates
// WITHIN the owner's tenant (same data scope) but limited by permissions and
// assignment. This composes with the existing owner identity — it does not
// replace it.

import crypto from "crypto";
import { PERMISSION_IDS, migratePermissions, satisfies } from "@/lib/permissions";

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SECRET_KEY;
function H(extra: Record<string, string> = {}) {
  const key = SB_KEY()!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// All grantable permissions. Every permission here maps to a REAL screen or
// capability in the employee portal — nothing decorative. Keep in sync with
// the admin UI grid in components/TeamAccessModal.tsx.
//   - file_uploads was removed (image uploads were removed from the CRM).
//   - team_management was removed (managing the team is admin-only).
// V43: the catalogue lives in lib/permissions.ts. These re-exports keep older
// imports working while the codebase moves over.
export const ALL_PERMISSIONS = PERMISSION_IDS;
export type Permission = string;

export const PERMISSION_LABELS: Record<string, string> = {
  dashboard: "Dashboard", leads: "Leads", customers: "Customers", orders: "Orders",
  edit_leads: "Edit leads", edit_customers: "Edit customers", edit_orders: "Edit orders & payments",
  messaging: "Messaging", tasks: "Tasks", calendar: "Calendar", notes: "Notes",
  reports: "My reports", data_export: "Data export", financials: "Financial info", settings: "Profile & settings",
};

// Sensible default for a new sales employee.
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = ["dashboard", "leads", "customers", "orders", "tasks", "calendar", "notes", "settings"];

export function newSessionToken(): string {
  return "es_" + crypto.randomBytes(24).toString("hex");
}

export type EmployeeContext = {
  uid: string;            // owner tenant uid — data scopes to this
  employeeId: string;
  accountId: string;
  permissions: string[];
  name?: string;
};

async function cookieVal(name: string): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get(name)?.value ?? null;
  } catch { return null; }
}

// Resolve the current employee session, or null. Validates expiry.
export async function getEmployee(): Promise<EmployeeContext | null> {
  const token = await cookieVal("dawn_emp");
  if (!token) return null;
  const url = SB_URL(), key = SB_KEY();
  if (!url || !key) return null;
  try {
    const rows = await (await fetch(`${url}/rest/v1/employee_sessions?token=eq.${token}&select=*&limit=1`, { headers: H(), cache: "no-store" })).json();
    const s = rows?.[0];
    if (!s || new Date(s.expires_at).getTime() < Date.now()) return null;
    // Load account for current permissions + active flag
    const accRows = await (await fetch(`${url}/rest/v1/employee_accounts?id=eq.${s.account_id}&select=*&limit=1`, { headers: H(), cache: "no-store" })).json();
    const acc = accRows?.[0];
    if (!acc || !acc.active) return null;

    // Billing (V26): the portal belongs to the CRM & Business area. If the
    // owner's trial/subscription lapsed or they didn't buy CRM, employees are
    // locked out here — one gate covers every team API and login.
    try {
      const { getEntitlements } = await import("@/lib/entitlements");
      const ent = await getEntitlements(url, key, s.uid);
      if (!ent.canWrite || !ent.features.crm) return null;
    } catch { /* fail open — billing down ≠ portal down */ }
    // Employee name (for greeting)
    let name: string | undefined;
    try {
      const eRows = await (await fetch(`${url}/rest/v1/employees?id=eq.${s.employee_id}&select=name&limit=1`, { headers: H(), cache: "no-store" })).json();
      name = eRows?.[0]?.name;
    } catch {}
    return { uid: s.uid, employeeId: s.employee_id, accountId: s.account_id, permissions: acc.permissions || [], name };
  } catch { return null; }
}

export function hasPermission(ctx: EmployeeContext | null, perm: string): boolean {
  if (!ctx || !Array.isArray(ctx.permissions)) return false;
  // V43: stored permissions may still be in the old vocabulary, and routes may
  // still ask in it. Translating in the one place every check passes through
  // means the rollout doesn't depend on migrating 40 call sites atomically —
  // old grants answer new questions and new grants answer old ones.
  const held = migratePermissions(ctx.permissions);
  return satisfies(held, perm) || held.includes(perm);
}

/** The caller's permissions in the current vocabulary. */
export function effectivePermissions(ctx: EmployeeContext | null): string[] {
  if (!ctx || !Array.isArray(ctx.permissions)) return [];
  return migratePermissions(ctx.permissions);
}

// Guard for employee API routes. Returns context or an error signal, and
// checks a required permission. Ownership (employee_id scoping) is applied
// by each route using ctx.employeeId.
export type EmpGuard =
  | { ok: false; status: number; error: string }
  | { ok: true; ctx: EmployeeContext; url: string; key: string };

export async function guardEmployee(perm?: Permission): Promise<EmpGuard> {
  const ctx = await getEmployee();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { ok: false, status: 500, error: "Not configured." };
  if (!ctx) return { ok: false, status: 401, error: "Please sign in." };
  if (perm && !hasPermission(ctx, perm)) return { ok: false, status: 403, error: "You don't have access to this." };
  return { ok: true, ctx, url, key };
}

export function empHeaders(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
