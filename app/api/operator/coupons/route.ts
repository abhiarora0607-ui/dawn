// app/api/operator/coupons/route.ts
// Launch offers and festive discounts, operator-managed. Codes are uppercase,
// one redemption per business, optional expiry and redemption cap.

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  const rows = await fetch(`${url}/rest/v1/coupons?order=created_at.desc&limit=50`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  return NextResponse.json({ coupons: Array.isArray(rows) ? rows : [] });
}

export async function POST(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
    if (!code) return NextResponse.json({ error: "Code required." }, { status: 400 });
    const kind = ["percent", "flat", "first_free"].includes(b.kind) ? b.kind : "percent";
    const row = {
      code, kind,
      value: kind === "first_free" ? 0 : Math.max(0, Number(b.value) || 0),
      max_redemptions: b.max_redemptions ? Math.max(1, Number(b.max_redemptions)) : null,
      expires_at: b.expires_at || null,
      is_active: b.is_active !== false,
    };
    await fetch(`${url}/rest/v1/coupons`, { method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Save failed." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    if (!b.code) return NextResponse.json({ error: "Missing code." }, { status: 400 });
    await fetch(`${url}/rest/v1/coupons?code=eq.${encodeURIComponent(b.code)}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ is_active: !!b.is_active }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 400 }); }
}
