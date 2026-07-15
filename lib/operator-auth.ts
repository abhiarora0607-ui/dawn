// lib/operator-auth.ts
// The lock on the operator console. Identity = OPERATOR_EMAIL + a passphrase,
// both set as environment variables in Vercel — never stored in the database,
// never in the repo. A correct login sets an httpOnly cookie whose value is
// an HMAC derived from both secrets, so sessions can't be forged and changing
// the passphrase invalidates every session instantly.

import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "dawn_op";

function expectedToken(): string | null {
  const email = process.env.OPERATOR_EMAIL;
  const pass = process.env.OPERATOR_PASSPHRASE;
  if (!email || !pass) return null;
  return crypto.createHmac("sha256", pass).update(`op:${email.trim().toLowerCase()}`).digest("hex");
}

export function operatorConfigured(): boolean {
  return !!(process.env.OPERATOR_EMAIL && process.env.OPERATOR_PASSPHRASE);
}

/** Constant-time check of a login attempt. */
export function checkOperatorLogin(email: string, passphrase: string): boolean {
  const wantEmail = (process.env.OPERATOR_EMAIL || "").trim().toLowerCase();
  const wantPass = process.env.OPERATOR_PASSPHRASE || "";
  if (!wantEmail || !wantPass) return false;
  const a = crypto.createHash("sha256").update(`${email.trim().toLowerCase()}|${passphrase}`).digest();
  const b = crypto.createHash("sha256").update(`${wantEmail}|${wantPass}`).digest();
  return crypto.timingSafeEqual(a, b);
}

export function operatorCookieValue(): string | null {
  return expectedToken();
}

export async function isOperator(): Promise<boolean> {
  const want = expectedToken();
  if (!want) return false;
  const got = cookies().get(COOKIE)?.value || "";
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export const OPERATOR_COOKIE = COOKIE;
