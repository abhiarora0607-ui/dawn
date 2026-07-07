// app/api/demo/route.ts
// Seeds realistic demo data so the app can be evaluated populated, and
// clears it. Demo rows are tagged so clearing only removes demo data.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

const DEMO_TAG = "__demo__";

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const action = new URL(req.url).searchParams.get("action");

  if (action === "clear") {
    try {
      // Delete demo-tagged rows
      await fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&sku=eq.${DEMO_TAG}`, { method: "DELETE", headers: H(key) });
      const demoContacts = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&notes=eq.${DEMO_TAG}&select=id`, { headers: H(key), cache: "no-store" })).json();
      for (const c of demoContacts || []) {
        await fetch(`${url}/rest/v1/activities?contact_id=eq.${c.id}`, { method: "DELETE", headers: H(key) });
        await fetch(`${url}/rest/v1/sales?contact_id=eq.${c.id}`, { method: "DELETE", headers: H(key) });
      }
      await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&notes=eq.${DEMO_TAG}`, { method: "DELETE", headers: H(key) });
      return NextResponse.json({ ok: true, cleared: true });
    } catch { return NextResponse.json({ error: "Clear failed." }, { status: 500 }); }
  }

  // Seed
  try {
    const items = [
      { name: "Cold-pressed green juice", category: "Juices", price: 250, unit: "per item", type: "product" },
      { name: "Detox sampler pack (6)", category: "Bundles", price: 1290, compare_at_price: 1500, unit: "per item", type: "product" },
      { name: "Monthly juice subscription", category: "Subscriptions", price: 4999, unit: "per month", type: "service" },
      { name: "1:1 nutrition consult", category: "Services", price: 799, unit: "per session", type: "service" },
    ];
    for (const it of items) {
      await fetch(`${url}/rest/v1/catalog_items`, { method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid, sku: DEMO_TAG, is_active: true, is_public: true, ...it }) });
    }

    const contacts = [
      { name: "Ananya Sharma", phone: "9810012345", instagram_handle: "ananya.eats", source: "Instagram DM", stage: "New Lead" },
      { name: "Rohit Mehta", phone: "9820098765", source: "WhatsApp", stage: "Negotiating" },
      { name: "Priya Nair", phone: "9995567788", source: "Referral", stage: "Customer (Won)" },
      { name: "Karan Singh", phone: "9876543210", source: "Walk-in", stage: "Contacted" },
    ];
    for (const c of contacts) {
      const res = await fetch(`${url}/rest/v1/contacts`, { method: "POST", headers: H(key, { Prefer: "return=representation" }), body: JSON.stringify({ uid, notes: DEMO_TAG, ...c }) });
      const created = (await res.json())?.[0];
      if (created?.id) {
        await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid, contact_id: created.id, type: "note", content: "Demo contact created" }) });
        if (c.stage === "Customer (Won)") {
          await fetch(`${url}/rest/v1/sales`, { method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid, contact_id: created.id, items: [{ itemId: "demo", name: "Detox sampler pack (6)", qty: 1, unitPrice: 1290 }], subtotal: 1290, discount: 0, total: 1290, amount_paid: 1290, balance: 0, payment_method: "UPI", status: "paid" }) });
        }
      }
    }
    return NextResponse.json({ ok: true, seeded: true });
  } catch { return NextResponse.json({ error: "Seed failed." }, { status: 500 }); }
}
