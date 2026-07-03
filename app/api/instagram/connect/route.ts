// app/api/instagram/connect/route.ts
// Starts the Instagram Login (OAuth) flow. Redirects the user to
// Instagram's authorization screen. After they approve, Instagram
// sends them back to /api/instagram/callback with a code.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const appId = process.env.INSTAGRAM_APP_ID;
  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/instagram/callback`;

  if (!appId) {
    return NextResponse.json(
      { error: "Instagram connection isn't configured yet." },
      { status: 500 }
    );
  }

  // Scopes for the Instagram API with Instagram Login (Business/Creator).
  const scope = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_business_manage_comments",
    "instagram_business_content_publish",
  ].join(",");

  const authUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scope)}`;

  return NextResponse.redirect(authUrl);
}
