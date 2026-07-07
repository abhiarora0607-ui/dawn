// app/api/schedule/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function igUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch { return null; }
}
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }

export async function GET() {
  const id = await igUserId();
  const { url, key } = sb();
  if (!id || !url || !key) return NextResponse.json({ items: [] });
  try {
    const res = await fetch(`${url}/rest/v1/scheduled_actions?ig_user_id=eq.${id}&order=created_at.desc&limit=100`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    return NextResponse.json({ items: await res.json() });
  } catch { return NextResponse.json({ items: [] }); }
}

export async function POST(req: Request) {
  const id = await igUserId();
  const { url, key } = sb();
  if (!id || !url || !key) return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
  try {
    const b = await req.json();
    const res = await fetch(`${url}/rest/v1/scheduled_actions`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        ig_user_id: id, kind: b.kind || "post", status: "queued",
        scheduled_for: b.scheduled_for || null, title: b.title || "", body: b.body || "", meta: b.meta || {},
      }),
    });
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Queue failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const id = await igUserId();
  const { url, key } = sb();
  if (!id || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 400 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    await fetch(`${url}/rest/v1/scheduled_actions?id=eq.${b.id}&ig_user_id=eq.${id}`, {
      method: "PATCH", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ status: b.status || "done" }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}
