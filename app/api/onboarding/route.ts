// app/api/onboarding/route.ts
// Tells the dashboard how far a new business has come through first setup, so
// we can guide them the last mile. All uid-scoped; pure counts.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" }; }

async function countRows(url: string, key: string, table: string, filter: string): Promise<number> {
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${filter}&select=id&limit=1`, { headers: H(key), cache: "no-store" });
    return Number(res.headers.get("content-range")?.split("/")[1] || 0);
  } catch { return 0; }
}

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ available: false });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });

  try {
    const [items, contacts, orders, employees, settings] = await Promise.all([
      countRows(url, key, "catalog_items", `uid=eq.${uid}&is_demo=eq.false&deleted_at=is.null`),
      countRows(url, key, "contacts", `uid=eq.${uid}&is_demo=eq.false&deleted_at=is.null`),
      countRows(url, key, "sales", `uid=eq.${uid}&is_demo=eq.false&deleted_at=is.null`),
      countRows(url, key, "employees", `uid=eq.${uid}&is_demo=eq.false&is_owner=eq.false`),
      fetch(`${url}/rest/v1/business_settings?uid=eq.${uid}&select=business_name&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);

    const named = Array.isArray(settings) && settings[0]?.business_name;
    const steps = [
      { key: "name", label: "Name your business", done: !!named, href: "/dashboard/settings" },
      { key: "item", label: "Add your first product or service", done: items > 0, href: "/dashboard/price-list" },
      { key: "contact", label: "Add your first contact", done: contacts > 0, href: "/dashboard/contacts" },
      { key: "order", label: "Record your first order", done: orders > 0, href: "/dashboard/orders" },
      { key: "employee", label: "Invite a team member (optional)", done: employees > 0, href: "/dashboard/employees", optional: true },
    ];
    const required = steps.filter((s) => !s.optional);
    const doneCount = required.filter((s) => s.done).length;
    const complete = doneCount === required.length;

    return NextResponse.json({ available: true, steps, doneCount, total: required.length, complete });
  } catch {
    return NextResponse.json({ available: false });
  }
}
