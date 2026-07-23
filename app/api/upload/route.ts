// app/api/upload/route.ts
// Uploads an image to Supabase Storage (bucket: dawn-uploads) and returns
// its public URL. Used for logo, item photos, and payment screenshots.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  let uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!uid) {
    // V55: employees upload too — receipt photos for expense claims. Same
    // 5MB image-only limits, stored under the BUSINESS's folder (the
    // employee context carries the owner uid), so nothing leaks across
    // tenants and the storage story stays one bucket, one folder per business.
    const { guardEmployee } = await import("@/lib/employee-auth");
    const g = await guardEmployee();
    if (!g.ok) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    uid = g.ctx.uid;
  }
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Storage not configured." }, { status: 500 });

  try {
    const body = await req.json();
    const dataUrl: string = body.dataUrl || "";
    const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return NextResponse.json({ error: "Invalid image." }, { status: 400 });
    const contentType = m[1];
    const ext = contentType.split("/")[1].replace("jpeg", "jpg");
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > 5 * 1024 * 1024) return NextResponse.json({ error: "Image too large (max 5MB)." }, { status: 400 });

    const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await fetch(`${url}/storage/v1/object/dawn-uploads/${path}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": contentType },
      body: bytes,
    });
    if (!up.ok) {
      const t = await up.text();
      return NextResponse.json({ error: "Upload failed. Make sure the 'dawn-uploads' bucket exists and is public.", detail: t }, { status: 500 });
    }
    const publicUrl = `${url}/storage/v1/object/public/dawn-uploads/${path}`;
    return NextResponse.json({ url: publicUrl });
  } catch {
    return NextResponse.json({ error: "Upload error." }, { status: 500 });
  }
}
