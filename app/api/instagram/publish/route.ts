// app/api/instagram/publish/route.ts
// Publishes a photo to the connected Instagram account using the
// official Content Publishing API (content_publish permission).
//
// IMPORTANT: Instagram's publish flow requires a PUBLICLY ACCESSIBLE
// image URL — it fetches the image itself; it does not accept raw
// uploads. So the caller must pass an image_url that Instagram can reach.
// (For the MVP we accept a hosted URL; wiring an uploader is a later step.)

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getToken(): Promise<{ token: string; igUserId: string } | null> {
  try {
    const { cookies } = await import("next/headers");
    const igUserId = cookies().get("dawn_ig")?.value;
    if (!igUserId) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return null;
    const res = await fetch(
      `${url}/rest/v1/ig_connections?ig_user_id=eq.${igUserId}&select=access_token&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    const rows = await res.json();
    const token = rows?.[0]?.access_token;
    return token ? { token, igUserId } : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const conn = await getToken();
  if (!conn) {
    return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
  }

  let imageUrl = "";
  let caption = "";
  try {
    const body = await req.json();
    imageUrl = body.image_url || "";
    caption = body.caption || "";
    if (!imageUrl) throw new Error("no url");
  } catch {
    return NextResponse.json(
      { error: "A publicly accessible image URL is required to publish." },
      { status: 400 }
    );
  }

  try {
    // Step 1: create a media container
    const createRes = await fetch(`https://graph.instagram.com/v21.0/me/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: conn.token }),
    });
    const createData = await createRes.json();
    if (!createData.id) {
      return NextResponse.json(
        { error: createData?.error?.message || "Couldn't create the post container." },
        { status: 500 }
      );
    }

    // Step 2: publish the container
    const pubRes = await fetch(`https://graph.instagram.com/v21.0/me/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: createData.id, access_token: conn.token }),
    });
    const pubData = await pubRes.json();
    if (!pubData.id) {
      return NextResponse.json(
        { error: pubData?.error?.message || "Couldn't publish the post." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, postId: pubData.id });
  } catch {
    return NextResponse.json({ error: "Publishing failed. Try again." }, { status: 500 });
  }
}
