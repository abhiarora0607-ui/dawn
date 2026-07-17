// app/api/expenses/route.ts
import { NextResponse } from "next/server";
import { writeBlocked, requireArea } from "@/lib/entitlements";
import { softDelete } from "@/lib/soft-delete";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ expenses: [] });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const res = await fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&deleted_at=is.null&order=date.desc`, { headers: H(key), cache: "no-store" });
    return NextResponse.json({ expenses: await res.json() });
  } catch { return NextResponse.json({ expenses: [] }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });

  try {
    const b = await req.json();
    if (b.amount == null || Number(b.amount) < 0) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });

    // If flagged recurring, create a recurring definition too (manual recurring).
    if (b.recurring) {
      await fetch(`${url}/rest/v1/recurring_expenses`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, source: "manual", category: b.category || "Other", amount: Number(b.amount), note: b.note || "", enabled: true }),
      });
    }

    const res = await fetch(`${url}/rest/v1/expenses`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, date: b.date || new Date().toISOString().slice(0, 10), category: b.category || "Other", amount: Number(b.amount), note: b.note || "", source: b.recurring ? "recurring" : "manual", recurring: !!b.recurring }),
    });
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await softDelete(url, key, "expenses", id, uid);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}
