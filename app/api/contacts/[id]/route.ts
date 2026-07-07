// app/api/contacts/[id]/route.ts
import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const [c, acts, sales] = await Promise.all([
      fetch(`${url}/rest/v1/contacts?id=eq.${params.id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/activities?contact_id=eq.${params.id}&uid=eq.${uid}&order=created_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?contact_id=eq.${params.id}&uid=eq.${uid}&order=date.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    if (!c?.[0]) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ contact: c[0], activities: acts || [], sales: sales || [] });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}

// Add a note (timeline entry)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.content?.trim()) return NextResponse.json({ error: "Empty note." }, { status: 400 });
    await fetch(`${url}/rest/v1/activities`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, contact_id: params.id, type: "note", content: b.content.trim() }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}
