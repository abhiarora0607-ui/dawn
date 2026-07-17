// app/api/saved/route.ts
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

async function igUserId(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get("dawn_ig")?.value ?? null;
  } catch { return null; }
}

function sb() {
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
}

export async function GET() {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const id = await igUserId();
  const { url, key } = sb();
  if (!id || !url || !key) return NextResponse.json({ items: [] });
  try {
    const res = await fetch(`${url}/rest/v1/saved_content?ig_user_id=eq.${id}&select=*&order=created_at.desc&limit=100`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    return NextResponse.json({ items: await res.json() });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request) {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const id = await igUserId();
  const { url, key } = sb();
  if (!id || !url || !key) return NextResponse.json({ error: "Connect Instagram first." }, { status: 400 });
  try {
    const b = await req.json();
    const res = await fetch(`${url}/rest/v1/saved_content`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ ig_user_id: id, kind: b.kind || "caption", title: b.title || "", body: b.body || "", meta: b.meta || {} }),
    });
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  { // Billing: Instagram & AI is a plan area.
    const _uid = await (await import("@/lib/auth")).getUid();
    const _url = process.env.NEXT_PUBLIC_SUPABASE_URL, _key = process.env.SUPABASE_SECRET_KEY;
    if (_uid && _url && _key) {
      const _area = await requireArea(_url, _key, _uid, "instagram_ai");
      if (_area) return NextResponse.json(_area, { status: 403 });
    }
  }
  const id = await igUserId();
  const { url, key } = sb();
  if (!id || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 400 });
  const itemId = new URL(req.url).searchParams.get("id");
  if (!itemId) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await fetch(`${url}/rest/v1/saved_content?id=eq.${itemId}&ig_user_id=eq.${id}`, {
      method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
}
