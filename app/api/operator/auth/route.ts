// app/api/operator/auth/route.ts
// POST { email, passphrase } → sets the operator cookie on success.
// DELETE → logs out. Rate-limited like every other login in Dawn.

import { NextResponse } from "next/server";
import { checkOperatorLogin, operatorConfigured, operatorCookieValue, OPERATOR_COOKIE } from "@/lib/operator-auth";
import { isRateLimited, recordFailedAttempt, clearAttempts, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!operatorConfigured()) {
    return NextResponse.json({ error: "Operator access isn't configured. Add OPERATOR_EMAIL and OPERATOR_PASSPHRASE in Vercel → Settings → Environment Variables, then redeploy." }, { status: 500 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  let email = "", passphrase = "";
  try { const b = await req.json(); email = b.email || ""; passphrase = b.passphrase || ""; } catch {}
  if (!email || !passphrase) return NextResponse.json({ error: "Enter your email and passphrase." }, { status: 400 });

  const ident = "operator";
  const ipIdent = `ip:${clientIp(req)}`;
  if (url && key && (await isRateLimited(url, key, ident) || await isRateLimited(url, key, ipIdent))) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  if (!checkOperatorLogin(email, passphrase)) {
    if (url && key) { await recordFailedAttempt(url, key, ident); await recordFailedAttempt(url, key, ipIdent); }
    return NextResponse.json({ error: "Wrong email or passphrase." }, { status: 401 });
  }

  if (url && key) await clearAttempts(url, key, ident);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPERATOR_COOKIE, operatorCookieValue()!, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, // 12h sessions
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPERATOR_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
