// app/api/search/route.ts
import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  const raw = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!uid || !url || !key || raw.length < 2) return NextResponse.json({ results: [] });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });

  // Strip PostgREST filter metacharacters so the query can't be broken out of
  // (*, comma, parentheses, backslash), then URL-encode the safe remainder.
  const safe = raw.replace(/[*(),\\]/g, " ").trim().slice(0, 60);
  if (safe.length < 2) return NextResponse.json({ results: [] });
  const q = encodeURIComponent(safe);

  try {
    const [contacts, items, people] = await Promise.all([
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&or=(name.ilike.*${q}*,phone.ilike.*${q}*,instagram_handle.ilike.*${q}*)&select=id,name,phone,stage&limit=6`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&deleted_at=is.null&name=ilike.*${q}*&select=id,name,price&limit=6`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
          fetch(`${url}/rest/v1/employees?uid=eq.${uid}&status=eq.active&or=(name.ilike.*${q}*,job_title.ilike.*${q}*,phone.ilike.*${q}*)&select=id,name,job_title,phone&limit=5`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const results = [
      ...(Array.isArray(contacts) ? contacts : []).map((c: any) => ({ kind: "contact", id: c.id, title: c.name, sub: c.phone || c.stage, href: `/dashboard/contacts/${c.id}` })),
      ...(Array.isArray(items) ? items : []).map((i: any) => ({ kind: "item", id: i.id, title: i.name, sub: `₹${i.price ?? 0}`, href: `/dashboard/price-list/${i.id}` })),
      // V38: people are searchable from the same box. Looking someone up is
      // the same reflex as looking up a contact, and a second search bar for
      // colleagues would just be a thing to hunt for.
      ...(Array.isArray(people) ? people : []).map((e: any) => ({
        kind: "person", id: e.id, title: e.name,
        sub: [e.job_title, e.phone].filter(Boolean).join(" · ") || "Team member",
        href: `/dashboard/attendance/${e.id}`,
      })),
    ];
    return NextResponse.json({ results });
  } catch { return NextResponse.json({ results: [] }); }
}
