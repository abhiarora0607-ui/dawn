// app/api/team/password/route.ts
import { NextResponse } from "next/server";
import { getEmployee } from "@/lib/employee-auth";
import { hashPassword, verifyPassword, passwordIssue } from "@/lib/password";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }

export async function POST(req: Request) {
  const ctx = await getEmployee();
  const { url, key } = sb();
  if (!ctx || !url || !key) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const b = await req.json();
    const issue = passwordIssue(b.newPassword || "");
    if (issue) return NextResponse.json({ error: issue }, { status: 400 });

    const acc = (await (await fetch(`${url}/rest/v1/employee_accounts?id=eq.${ctx.accountId}&select=password_hash,password_salt&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    if (!acc) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (!verifyPassword(b.currentPassword || "", acc.password_hash, acc.password_salt)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
    }
    const { hash, salt } = hashPassword(b.newPassword);
    await fetch(`${url}/rest/v1/employee_accounts?id=eq.${ctx.accountId}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ password_hash: hash, password_salt: salt, must_change_password: false }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}
