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
    for (const f of ["business_name", "logo_url", "phone", "whatsapp", "address", "currency", "business_type", "gst_number"]) {
      if (b[f] !== undefined) row[f] = b[f];
    }
    if (b.revenue_target !== undefined) row.revenue_target = b.revenue_target === "" || b.revenue_target == null ? null : Number(b.revenue_target);
    if (b.stage_names !== undefined) row.stage_names = b.stage_names;
    await fetch(`${url}/rest/v1/business_settings`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(row),
    });
    // Mirror key fields into storefront so the public price list & receipts
    // match. Only include fields actually provided, so a partial save (e.g.
    // just the logo) never blanks the business name or phone already there.
    const mirrorFields = ["business_name", "logo_url", "phone", "whatsapp", "currency"];
    const mirror: any = { uid, updated_at: new Date().toISOString() };
    let hasMirror = false;
    for (const f of mirrorFields) {
      if (b[f] !== undefined) { mirror[f] = b[f]; hasMirror = true; }
    }
    if (hasMirror) {
      await fetch(`${url}/rest/v1/storefront`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(mirror),
      });
    }
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Save failed." }, { status: 400 }); }
}
