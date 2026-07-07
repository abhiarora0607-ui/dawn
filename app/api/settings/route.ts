// app/api/settings/route.ts
import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ settings: {} });
  try {
    const res = await fetch(`${url}/rest/v1/business_settings?uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" });
    const rows = await res.json();
    return NextResponse.json({ settings: rows?.[0] || {} });
  } catch { return NextResponse.json({ settings: {} }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    const row: any = { uid, updated_at: new Date().toISOString() };
    for (const f of ["business_name", "logo_url", "phone", "whatsapp", "address", "currency", "business_type"]) {
      if (b[f] !== undefined) row[f] = b[f];
    }
    if (b.stage_names !== undefined) row.stage_names = b.stage_names;
    await fetch(`${url}/rest/v1/business_settings`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
    });
    // Mirror key fields into storefront so the public price list & receipts match
    if (b.business_name !== undefined || b.logo_url !== undefined || b.phone !== undefined || b.whatsapp !== undefined || b.currency !== undefined) {
      await fetch(`${url}/rest/v1/storefront`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ uid, business_name: b.business_name, logo_url: b.logo_url, phone: b.phone, whatsapp: b.whatsapp, currency: b.currency, updated_at: new Date().toISOString() }),
      });
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Save failed." }, { status: 400 }); }
}
