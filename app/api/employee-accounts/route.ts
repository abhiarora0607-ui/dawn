// app/api/employee-accounts/route.ts
// Owner-only management of employee login accounts. Create credentials,
// reset password, change login id, activate/deactivate, set permissions.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { hashPassword, generatePassword, loginIdFromName, passwordIssue } from "@/lib/password";
import { DEFAULT_EMPLOYEE_PERMISSIONS } from "@/lib/employee-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

// GET: list accounts for this owner (joined with employee names client-side).
export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ accounts: [] });
  try {
    const rows = await (await fetch(`${url}/rest/v1/employee_accounts?uid=eq.${uid}&select=id,employee_id,login_id,active,permissions,must_change_password,last_login_at,created_at&order=created_at.desc`, { headers: H(key), cache: "no-store" })).json();
    return NextResponse.json({ accounts: Array.isArray(rows) ? rows : [] });
  } catch { return NextResponse.json({ accounts: [] }); }
}

// POST: create a login for an existing employee. Returns the plaintext temp
// password ONCE so the admin can share it (never stored in plaintext).
export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    if (!b.employeeId) return NextResponse.json({ error: "Missing employee." }, { status: 400 });

    // Verify the employee belongs to this owner
    const emp = (await (await fetch(`${url}/rest/v1/employees?id=eq.${b.employeeId}&uid=eq.${uid}&select=id,name&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    if (!emp) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

    // One account per employee
    const existing = (await (await fetch(`${url}/rest/v1/employee_accounts?employee_id=eq.${b.employeeId}&uid=eq.${uid}&select=id&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    if (existing) return NextResponse.json({ error: "This employee already has a login." }, { status: 409 });

    let loginId = (b.loginId || loginIdFromName(emp.name)).trim().toLowerCase();
    const tempPw = b.password || generatePassword();
    const issue = passwordIssue(tempPw);
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });
    const { hash, salt } = hashPassword(tempPw);

    const res = await fetch(`${url}/rest/v1/employee_accounts`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }),
      body: JSON.stringify({
        uid, employee_id: b.employeeId, login_id: loginId, password_hash: hash, password_salt: salt,
        active: true, permissions: b.permissions || DEFAULT_EMPLOYEE_PERMISSIONS, must_change_password: true,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (t.includes("duplicate") || t.includes("unique")) return NextResponse.json({ error: "That login ID is taken. Try another." }, { status: 409 });
      return NextResponse.json({ error: "Could not create login." }, { status: 500 });
    }
    const acc = (await res.json())?.[0];
    await audit({ uid, action: "employee_account.create", entity: "employee_accounts", entityId: acc?.id, meta: { employeeId: b.employeeId, loginId } });
    return NextResponse.json({ account: acc, loginId, tempPassword: tempPw });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

// PATCH: update login id, reset password, toggle active, set permissions.
export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    // Ensure account belongs to this owner
    const acc = (await (await fetch(`${url}/rest/v1/employee_accounts?id=eq.${b.id}&uid=eq.${uid}&select=id&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    if (!acc) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const patch: any = {};
    let newTempPw: string | null = null;
    if (b.loginId !== undefined) patch.login_id = String(b.loginId).trim().toLowerCase();
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.permissions !== undefined) patch.permissions = b.permissions;
    if (b.resetPassword) {
      newTempPw = b.password || generatePassword();
      const issue = passwordIssue(newTempPw as string);
      if (issue) return NextResponse.json({ error: issue }, { status: 400 });
      const { hash, salt } = hashPassword(newTempPw as string);
      patch.password_hash = hash; patch.password_salt = salt; patch.must_change_password = true;
    }

    const res = await fetch(`${url}/rest/v1/employee_accounts?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const t = await res.text();
      if (t.includes("duplicate") || t.includes("unique")) return NextResponse.json({ error: "That login ID is taken." }, { status: 409 });
      return NextResponse.json({ error: "Update failed." }, { status: 500 });
    }
    // If deactivated, kill active sessions
    if (b.active === false) {
      await fetch(`${url}/rest/v1/employee_sessions?account_id=eq.${b.id}`, { method: "DELETE", headers: H(key) });
    }
    await audit({ uid, action: b.resetPassword ? "employee_account.reset_password" : "employee_account.update", entity: "employee_accounts", entityId: b.id });
    return NextResponse.json({ ok: true, ...(newTempPw ? { tempPassword: newTempPw } : {}) });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

// DELETE: remove an employee login (revokes access; HR record stays).
export async function DELETE(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await fetch(`${url}/rest/v1/employee_sessions?account_id=eq.${id}`, { method: "DELETE", headers: H(key) });
    await fetch(`${url}/rest/v1/employee_accounts?id=eq.${id}&uid=eq.${uid}`, { method: "DELETE", headers: H(key) });
    await audit({ uid, action: "employee_account.delete", entity: "employee_accounts", entityId: id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}
