// app/api/instagram/callback/route.ts
// Instagram redirects here after the user approves. We exchange the
// short-lived code for an access token, upgrade it to a long-lived
// token, store it in Supabase, and send the user to the dashboard.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const origin = url.origin;

  if (error || !code) {
    return NextResponse.redirect(`${origin}/signin?error=cancelled`);
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = `${origin}/api/instagram/callback`;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${origin}/signin?error=failed`);
  }

  try {
    // 1) Exchange code for short-lived token
    const form = new URLSearchParams();
    form.set("client_id", appId);
    form.set("client_secret", appSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri);
    form.set("code", code);

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const tokenData = await tokenRes.json();
    const shortToken = tokenData.access_token;
    const igUserId = tokenData.user_id;
    if (!shortToken) {
      return NextResponse.redirect(`${origin}/signin?error=failed`);
    }

    // 2) Upgrade to long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
    );
    const longData = await longRes.json();
    const longToken = longData.access_token || shortToken;

    // 3) IDENTITY SPINE — the Instagram is the key to the business.
    //    Resolve which business this IG opens, in strict order:
    //      a) IG already owns a business → sign into it (recovery/multi-device)
    //      b) else, this browser holds an unclaimed business WITH data → the
    //         IG claims it (one-time migration for pre-V16 workspaces)
    //      c) else → a fresh business, deterministically named ig_<id> so the
    //         DM webhook's fallback and this always agree.
    //    The Meta handshake above is untouched; only what we record changed.
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SECRET_KEY;
    let resolvedUid = `ig_${igUserId}`;

    if (sbUrl && sbKey) {
      const h = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" };

      // Store/refresh the token (never touches owner_uid — claims are sacred).
      await fetch(`${sbUrl}/rest/v1/ig_connections`, {
        method: "POST",
        headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ ig_user_id: String(igUserId), access_token: longToken, connected_at: new Date().toISOString() }),
      });

      // (a) Does this IG already own a business?
      const conn = (await (await fetch(`${sbUrl}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&select=owner_uid&limit=1`, { headers: h, cache: "no-store" })).json())?.[0];

      if (conn?.owner_uid) {
        resolvedUid = conn.owner_uid; // returning business — welcome back
      } else {
        // (b) Claim check: the browser's current business, if it has data and
        //     no Instagram has claimed it yet.
        let browserUid: string | null = null;
        try {
          const { cookies } = await import("next/headers");
          browserUid = cookies().get("dawn_uid")?.value || null;
        } catch {}

        let claimed = false;
        if (browserUid && browserUid !== `ig_${igUserId}`) {
          const [ownedElsewhere, hasSettings, hasContacts] = await Promise.all([
            fetch(`${sbUrl}/rest/v1/ig_connections?owner_uid=eq.${encodeURIComponent(browserUid)}&select=ig_user_id&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json()),
            fetch(`${sbUrl}/rest/v1/business_settings?uid=eq.${encodeURIComponent(browserUid)}&select=uid&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json()),
            fetch(`${sbUrl}/rest/v1/contacts?uid=eq.${encodeURIComponent(browserUid)}&select=id&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json()),
          ]);
          const alreadyOwned = Array.isArray(ownedElsewhere) && ownedElsewhere.length > 0;
          const hasData = (Array.isArray(hasSettings) && hasSettings.length > 0) || (Array.isArray(hasContacts) && hasContacts.length > 0);
          if (!alreadyOwned && hasData) {
            resolvedUid = browserUid;
            claimed = true;
          }
        }

        // Stamp ownership — only because it was NULL a moment ago.
        await fetch(`${sbUrl}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&owner_uid=is.null`, {
          method: "PATCH", headers: { ...h, Prefer: "return=minimal" },
          body: JSON.stringify({ owner_uid: resolvedUid }),
        });

        if (claimed) {
          // Leave a permanent trace of the claim.
          try {
            const { audit } = await import("@/lib/audit");
            await audit({ uid: resolvedUid, action: "business.claim", entity: "ig_connections", entityId: String(igUserId), meta: { via: "instagram connect" } });
          } catch {}
        }
      }

      // Register the business (insert-or-keep; never overwrites email/date).
      await fetch(`${sbUrl}/rest/v1/dawn_users`, {
        method: "POST",
        headers: { ...h, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ uid: resolvedUid, ig_user_id: String(igUserId) }),
      });

      // The business is alive right now.
      try {
        const { touchActive } = await import("@/lib/touch");
        await touchActive(sbUrl, sbKey, resolvedUid);
      } catch {}

      // Referral credit: if this browser arrived via a "Powered by Dawn" link,
      // record it once. Stored as an event (kind: referral) against the NEW
      // business, naming the referring storefront slug.
      try {
        const { cookies: ck } = await import("next/headers");
        const ref = ck().get("dawn_ref")?.value;
        if (ref) {
          const seen = await fetch(`${sbUrl}/rest/v1/events?uid=eq.${resolvedUid}&kind=eq.referral&select=id&limit=1`, { headers: h, cache: "no-store" }).then((r) => r.json()).catch(() => []);
          if (!Array.isArray(seen) || seen.length === 0) {
            await fetch(`${sbUrl}/rest/v1/events`, {
              method: "POST", headers: { ...h, Prefer: "return=minimal" },
              body: JSON.stringify({ uid: resolvedUid, kind: "referral", meta: { ref } }),
            });
          }
        }
      } catch { /* referral tracking never blocks sign-in */ }
    }

    // ONE cookie of truth: connecting sets both together, so the header and
    // the data can never again disagree about whose business this is.
    const res = NextResponse.redirect(`${origin}/dashboard?connect=success`);
    res.cookies.set("dawn_uid", resolvedUid, {
      httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90, path: "/",
    });
    res.cookies.set("dawn_ig", String(igUserId), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 60,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/signin?error=failed`);
  }
}
