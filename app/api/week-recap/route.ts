// app/api/week-recap/route.ts
// Last 7 days in four numbers — the in-app twin of the weekly digest email.
// CRM area (it's business data), uid-scoped, live rows only.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";

export const dynamic = "force-dynamic";
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export async function GET() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ available: false });
  const area = await requireArea(url, key, uid, "crm");
  if (area) return NextResponse.json({ available: false });

  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const [contacts, sales, overdue] = await Promise.all([
      // full-scan: week-bounded count, id-only
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&created_at=gte.${since}&select=id`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&date=gte.${since.slice(0, 10)}&select=amount_paid,order_status`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // full-scan: overdue count, id-only
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&follow_up_date=lt.${today}&select=id`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const orders = (Array.isArray(sales) ? sales : []).filter((s: any) => s.order_status !== "Cancelled");
    const collected = orders.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
    const leads = Array.isArray(contacts) ? contacts.length : 0;
    const overdueN = Array.isArray(overdue) ? overdue.length : 0;
    // Nothing happened → say nothing.
    if (leads === 0 && orders.length === 0 && overdueN === 0) return NextResponse.json({ available: false });
    return NextResponse.json({ available: true, leads, orders: orders.length, collected, overdue: overdueN });
  } catch { return NextResponse.json({ available: false }); }
}
