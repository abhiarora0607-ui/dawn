// app/api/feedback/route.ts
// The 😞😐😍 pulse. One tap from an owner → a row the operator reads. uid-scoped.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const b = await req.json();
    const mood = ["sad", "neutral", "happy"].includes(b.mood) ? b.mood : null;
    if (!mood) return NextResponse.json({ error: "Bad mood." }, { status: 400 });
    await fetch(`${url}/rest/v1/feedback`, {
      method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ uid, mood, note: String(b.note || "").slice(0, 500) || null }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}
