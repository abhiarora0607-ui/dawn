// lib/employee-auth.ts
// Employee session resolution + RBAC. An employee logs in with login_id +
// password, gets an opaque session token (cookie `dawn_emp`), and operates
// WITHIN the owner's tenant (same data scope) but limited by permissions and
// assignment. This composes with the existing owner identity — it does not
// replace it.

import crypto from "crypto";

const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SECRET_KEY;
function H(extra: Record<string, string> = {}) {
  const key = SB_KEY()!;
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// All grantable permissions. Keep in sync with the admin UI.
export const ALL_PERMISSIONS = [
  "dashboard", "leads", "customers", "orders", "messaging", "tasks",
  "calendar", "notes", "reports", "file_uploads", "data_export",
  "financials", "team_management", "settings",
] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<string, string> = {
  dashboard: "Dashboard", leads: "Leads", customers: "Customers", orders: "Orders",
  messaging: "Messaging", tasks: "Tasks", calendar: "Calendar", notes: "Notes",
  reports: "Reports", file_uploads: "File uploads", data_export: "Data export",
  financials: "Financial info", team_management: "Team management", settings: "Settings",
};

// Sensible default for a new sales employee.
export const DEFAULT_EMPLOYEE_PERMISSIONS: Permission[] = ["dashboard", "leads", "customers", "orders", "tasks", "notes"];

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
    // Employee name (for greeting)
    let name: string | undefined;
    try {
      const eRows = await (await fetch(`${url}/rest/v1/employees?id=eq.${s.employee_id}&select=name&limit=1`, { headers: H(), cache: "no-store" })).json();
      name = eRows?.[0]?.name;
    } catch {}
    return { uid: s.uid, employeeId: s.employee_id, accountId: s.account_id, permissions: acc.permissions || [], name };
  } catch { return null; }
}

export function hasPermission(ctx: EmployeeContext | null, perm: Permission): boolean {
  return !!ctx && Array.isArray(ctx.permissions) && ctx.permissions.includes(perm);
}
