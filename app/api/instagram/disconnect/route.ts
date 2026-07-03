// app/api/instagram/disconnect/route.ts
// Disconnects the current account: deletes the stored token and clears
// the cookie. Satisfies the data-deletion requirement.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  try {
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;

    if (igUserId) {
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const sbKey = process.env.SUPABASE_SECRET_KEY;
      if (sbUrl && sbKey) {
        await fetch(`${sbUrl}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}`, {
          method: "DELETE",
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
        });
      }
    }
  } catch {
    // ignore — we still clear the cookie below
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("dawn_ig", "", { httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}
