// app/api/operator/announcements/route.ts
// Operator posts/deletes changelog entries owners see as "What's new".

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  const rows = await fetch(`${url}/rest/v1/announcements?order=created_at.desc&limit=20`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  return NextResponse.json({ items: Array.isArray(rows) ? rows : [] });
}

export async function POST(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    if (!b.title) return NextResponse.json({ error: "Title required." }, { status: 400 });
    await fetch(`${url}/rest/v1/announcements`, { method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ title: String(b.title).slice(0, 120), body: String(b.body || "").slice(0, 600) || null }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await fetch(`${url}/rest/v1/announcements?id=eq.${id}`, { method: "DELETE", headers: H(key) });
  return NextResponse.json({ ok: true });
}
