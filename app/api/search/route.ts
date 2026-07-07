// app/api/search/route.ts
import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!uid || !url || !key || q.length < 2) return NextResponse.json({ results: [] });

  try {
    const [contacts, items] = await Promise.all([
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&or=(name.ilike.*${q}*,phone.ilike.*${q}*,instagram_handle.ilike.*${q}*)&select=id,name,phone,stage&limit=6`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&name.ilike=*${q}*&select=id,name,price&limit=6`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const results = [
      ...(Array.isArray(contacts) ? contacts : []).map((c: any) => ({ kind: "contact", id: c.id, title: c.name, sub: c.phone || c.stage, href: `/dashboard/contacts/${c.id}` })),
      ...(Array.isArray(items) ? items : []).map((i: any) => ({ kind: "item", id: i.id, title: i.name, sub: `₹${i.price ?? 0}`, href: `/dashboard/price-list` })),
    ];
    return NextResponse.json({ results });
  } catch { return NextResponse.json({ results: [] }); }
}
