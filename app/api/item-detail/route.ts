// app/api/item-detail/route.ts
// Everything about one catalogue item: which orders included it, units sold,
// revenue, margin, and which customers bought it. Order items are matched by
// name (how they're stored on each sale). All uid-scoped, live rows only.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const [itemRows, sales, contacts] = await Promise.all([
      fetch(`${url}/rest/v1/catalog_items?id=eq.${id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&select=id,contact_id,items,date,order_status,amount_paid&order=date.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=is.null&select=id,name`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const item = itemRows?.[0];
    if (!item) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const nameById: Record<string, string> = {};
    for (const c of Array.isArray(contacts) ? contacts : []) nameById[c.id] = c.name;
    const cost = Number(item.cost) || 0;

    let units = 0, revenue = 0;
    const orders: any[] = [];
    for (const s of Array.isArray(sales) ? sales : []) {
      if (s.order_status === "Cancelled") continue;
      for (const it of s.items || []) {
        if (it.name !== item.name) continue;
        const qty = Number(it.qty) || 1;
        const line = (Number(it.unitPrice) || 0) * qty;
        units += qty; revenue += line;
        orders.push({
          orderId: s.id, contactId: s.contact_id,
          customerName: s.contact_id ? nameById[s.contact_id] || "Customer" : "Walk-in",
          qty, lineTotal: line, date: s.date, status: s.order_status || "Placed",
        });
      }
    }

    const totalCost = cost * units;
    const marginPct = revenue > 0 && cost > 0 ? Math.round(((revenue - totalCost) / revenue) * 100) : null;

    // Top buyers of this item.
    const byBuyer: Record<string, { name: string; units: number; spent: number }> = {};
    for (const o of orders) {
      const k = o.contactId || "walkin";
      const b = (byBuyer[k] = byBuyer[k] || { name: o.customerName, units: 0, spent: 0 });
      b.units += o.qty; b.spent += o.lineTotal;
    }
    const topBuyers = Object.values(byBuyer).sort((a, b) => b.spent - a.spent).slice(0, 5);

    return NextResponse.json({
      item: { id: item.id, name: item.name, price: item.price, cost: item.cost, type: item.type, category: item.category, is_active: item.is_active, unit: item.unit },
      stats: { units, revenue, orders: orders.length, marginPct, totalCost, hasCost: cost > 0 },
      orders: orders.slice(0, 50),
      topBuyers,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  }
}
