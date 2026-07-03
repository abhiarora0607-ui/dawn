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
    return NextResponse.redirect(`${origin}/dashboard?connect=cancelled`);
  }

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = `${origin}/api/instagram/callback`;

  if (!appId || !appSecret) {
    return NextResponse.redirect(`${origin}/dashboard?connect=error`);
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
      return NextResponse.redirect(`${origin}/dashboard?connect=error`);
    }

    // 2) Upgrade to long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortToken}`
    );
    const longData = await longRes.json();
    const longToken = longData.access_token || shortToken;

    // 3) Store in Supabase (upsert on ig_user_id) using the server-only secret key
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SECRET_KEY;
    if (sbUrl && sbKey) {
      await fetch(`${sbUrl}/rest/v1/ig_connections`, {
        method: "POST",
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          ig_user_id: String(igUserId),
          access_token: longToken,
          connected_at: new Date().toISOString(),
        }),
      });
    }

    // Store the ig_user_id in a cookie so the dashboard knows who's connected
    const res = NextResponse.redirect(`${origin}/dashboard?connect=success`);
    res.cookies.set("dawn_ig", String(igUserId), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 60,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/dashboard?connect=error`);
  }
}
