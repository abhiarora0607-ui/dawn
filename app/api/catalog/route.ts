// app/api/catalog/route.ts
import { NextResponse } from "next/server";
import { writeBlocked } from "@/lib/entitlements";
import { softDelete } from "@/lib/soft-delete";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function headers(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ items: [], authed: !!uid });
  try {
    const res = await fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&deleted_at=is.null&order=sort_order.asc,created_at.desc`, {
      headers: headers(key), cache: "no-store",
    });
    return NextResponse.json({ items: await res.json(), authed: true });
  } catch { return NextResponse.json({ items: [], authed: true }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  // Billing: expired accounts are read-only (data safe, no new writes).
  const _blocked = await writeBlocked(url, key, uid);
  if (_blocked) return NextResponse.json(_blocked, { status: 403 });

  try {
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (b.price != null && Number(b.price) < 0) return NextResponse.json({ error: "Price can't be negative." }, { status: 400 });
    const row = {
      uid, type: b.type || "product", name: b.name.trim(), description: b.description || "",
      category: b.category || "", price: b.price ?? null, compare_at_price: b.compareAtPrice ?? null, cost: b.cost ?? 0,
      unit: b.unit || "per item", sku: b.sku || "", images: b.images || [], variants: b.variants || [],
      is_active: b.isActive !== false, is_public: b.isPublic !== false, sort_order: b.sortOrder ?? 0,
    };
    const res = await fetch(`${url}/rest/v1/catalog_items`, {
      method: "POST", headers: headers(key, { Prefer: "return=representation" }), body: JSON.stringify(row),
    });
    const created = await res.json();
    return res.ok ? NextResponse.json({ item: created?.[0] }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const patch: any = {};
    for (const f of ["type", "name", "description", "category", "price", "unit", "sku", "images", "variants", "cost"]) {
      if (b[f] !== undefined) patch[f] = b[f];
    }
    if (b.compareAtPrice !== undefined) patch.compare_at_price = b.compareAtPrice;
    if (b.isActive !== undefined) patch.is_active = b.isActive;
    if (b.isPublic !== undefined) patch.is_public = b.isPublic;
    if (b.sortOrder !== undefined) patch.sort_order = b.sortOrder;
    await fetch(`${url}/rest/v1/catalog_items?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: headers(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await softDelete(url, key, "catalog_items", id, uid);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}
