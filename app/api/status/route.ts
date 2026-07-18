// app/api/status/route.ts
// A public, unauthenticated health check. Answers "is it Dawn or is it me?"
// without exposing anything: it reports whether core dependencies respond,
// never counts, names, or data.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  const checks: Record<string, "ok" | "down" | "unknown"> = {
    app: "ok",
    database: "unknown",
    email: process.env.RESEND_API_KEY ? "ok" : "unknown",
    instagram: process.env.INSTAGRAM_APP_ID ? "ok" : "unknown",
  };

  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/app_config?select=key&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
      });
      checks.database = res.ok ? "ok" : "down";
    } catch { checks.database = "down"; }
  }

  const allOk = Object.values(checks).every((v) => v !== "down");
  return NextResponse.json({ ok: allOk, checks, at: new Date().toISOString() }, { status: allOk ? 200 : 503 });
}
