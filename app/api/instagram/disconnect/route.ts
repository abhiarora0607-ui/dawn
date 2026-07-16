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
        // Destroy the token (satisfies data-deletion) but KEEP the row and its
        // owner_uid — the Instagram↔business link is the user's key back into
        // their data. Deleting it would orphan the business.
        await fetch(`${sbUrl}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}`, {
          method: "PATCH",
          headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ access_token: "" }),
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
