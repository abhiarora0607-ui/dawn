// app/api/employee-login/route.ts
// Employee authentication. POST { loginId, password } → sets dawn_emp cookie.
// DELETE → logout. Records login history.

import { NextResponse } from "next/server";
import { isRateLimited, recordFailedAttempt, clearAttempts, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/password";
import { newSessionToken } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

async function recordLogin(url: string, key: string, uid: string, accountId: string | null, loginId: string, success: boolean, req: Request) {
  try {
    await fetch(`${url}/rest/v1/login_history`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid, account_id: accountId, login_id: loginId, success,
        ip: req.headers.get("x-forwarded-for") || null,
        user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
      }),
    });
  } catch {}
}

export async function POST(req: Request) {
  const { url, key } = sb();
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    const loginId = (b.loginId || "").trim().toLowerCase();
    const password = b.password || "";
    if (!loginId || !password) return NextResponse.json({ error: "Enter your login ID and password." }, { status: 400 });

    // Brute-force guard: too many recent failures for this login (or from
    // this IP) puts the account in a cooling-off window.
    const ident = `emp:${loginId}`;
    const ipIdent = `ip:${clientIp(req)}`;
    if (await isRateLimited(url, key, ident) || await isRateLimited(url, key, ipIdent)) {
      return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
    }

    const acc = (await (await fetch(`${url}/rest/v1/employee_accounts?login_id=eq.${encodeURIComponent(loginId)}&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];

    // Constant-ish failure path (avoid leaking whether the id exists)
    if (!acc || !acc.active || !verifyPassword(password, acc.password_hash, acc.password_salt)) {
      await recordFailedAttempt(url, key, ident);
      await recordFailedAttempt(url, key, ipIdent);
      if (acc) await recordLogin(url, key, acc.uid, acc.id, loginId, false, req);
      return NextResponse.json({ error: "Incorrect login ID or password." }, { status: 401 });
    }

    const token = newSessionToken();
    const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h
    await fetch(`${url}/rest/v1/employee_sessions`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ token, uid: acc.uid, employee_id: acc.employee_id, account_id: acc.id, expires_at: expires }),
    });
    await fetch(`${url}/rest/v1/employee_accounts?id=eq.${acc.id}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ last_login_at: new Date().toISOString() }),
    });
    await recordLogin(url, key, acc.uid, acc.id, loginId, true, req);

    await clearAttempts(url, key, ident);
    const res = NextResponse.json({ ok: true, mustChangePassword: acc.must_change_password });
    res.cookies.set("dawn_emp", token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return res;
  } catch { return NextResponse.json({ error: "Login failed." }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const { url, key } = sb();
  try {
    const { cookies } = await import("next/headers");
    const token = cookies().get("dawn_emp")?.value;
    if (token && url && key) await fetch(`${url}/rest/v1/employee_sessions?token=eq.${token}`, { method: "DELETE", headers: H(key) });
  } catch {}
  const res = NextResponse.json({ ok: true });
  res.cookies.set("dawn_emp", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
