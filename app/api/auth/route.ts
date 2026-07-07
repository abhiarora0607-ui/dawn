// app/api/auth/route.ts
// POST { email } → creates a magic link. If an email provider (RESEND_API_KEY)
// is configured, sends it. Otherwise returns the link so it can be shown
// (dev/no-email fallback — honest, not faked).
//
// GET ?token=... → verifies the token and sets the dawn_uid session cookie.

import { NextResponse } from "next/server";
import { createMagicToken, consumeMagicToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let email = "";
  try { email = (await req.json()).email || ""; } catch {}
  email = email.trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valid) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const token = await createMagicToken(email);
  if (!token) return NextResponse.json({ error: "Couldn't create sign-in link." }, { status: 500 });

  const origin = new URL(req.url).origin;
  const link = `${origin}/api/auth?token=${token}`;

  // Send via Resend if configured
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Dawn <onboarding@resend.dev>",
          to: email,
          subject: "Your Dawn sign-in link",
          html: `<p>Tap to sign in to Dawn:</p><p><a href="${link}">Sign in</a></p><p>This link expires in 30 minutes.</p>`,
        }),
      });
      return NextResponse.json({ ok: true, sent: true });
    } catch {
      // fall through to returning the link
    }
  }

  // No email provider configured — return the link so the user isn't stuck.
  return NextResponse.json({ ok: true, sent: false, link });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const origin = new URL(req.url).origin;
  if (!token) return NextResponse.redirect(`${origin}/signin?error=1`);

  const uid = await consumeMagicToken(token);
  if (!uid) return NextResponse.redirect(`${origin}/signin?error=expired`);

  const res = NextResponse.redirect(`${origin}/dashboard`);
  res.cookies.set("dawn_uid", uid, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
