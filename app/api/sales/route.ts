// app/api/sales/route.ts
// Records a sale. If tied to a contact, converts them to Customer and logs
// it in their timeline. Also supports standalone sales (auto-creates a
// customer). This is the core lead→customer conversion loop.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ sales: [] });
  try {
    const res = await fetch(`${url}/rest/v1/sales?uid=eq.${uid}&order=date.desc`, { headers: H(key), cache: "no-store" });
    return NextResponse.json({ sales: await res.json() });
  } catch { return NextResponse.json({ sales: [] }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    // Load current sale
    const cur = await (await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json();
    const sale = cur?.[0];
    if (!sale) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const addAmount = Number(b.addPayment) || 0;
    const newPaid = Math.min(Number(sale.total), (Number(sale.amount_paid) || 0) + addAmount);
    const newBalance = Math.max(0, Number(sale.total) - newPaid);
    const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : "pending";
    const payments = [...(sale.payments || []), { amount: addAmount, date: new Date().toISOString(), method: b.method || "cash" }];

    await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ amount_paid: newPaid, balance: newBalance, status: newStatus, payments }),
    });
    return NextResponse.json({ ok: true, status: newStatus, balance: newBalance });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    const items = b.items || [];
    const subtotal = items.reduce((s: number, it: any) => s + (Number(it.unitPrice) || 0) * (Number(it.qty) || 1), 0);
    const discount = Number(b.discount) || 0;
    const total = Math.max(0, subtotal - discount);
    const amountPaid = Number(b.amountPaid) || 0;
    const balance = Math.max(0, total - amountPaid);
    const status = balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "pending";

    let contactId = b.contactId || null;

    // Standalone sale → auto-create a customer
    if (!contactId && b.customerName) {
      const cRes = await fetch(`${url}/rest/v1/contacts`, {
        method: "POST", headers: H(key, { Prefer: "return=representation" }),
        body: JSON.stringify({ uid, name: b.customerName, phone: b.customerPhone || "", source: "Walk-in", stage: "Customer (Won)" }),
      });
      contactId = (await cRes.json())?.[0]?.id || null;
    }

    const saleRow = {
      uid, contact_id: contactId, items, subtotal, discount, total,
      amount_paid: amountPaid, balance, payment_method: b.paymentMethod || "cash",
      status, payments: amountPaid > 0 ? [{ amount: amountPaid, date: new Date().toISOString(), method: b.paymentMethod || "cash" }] : [],
      notes: b.notes || "",
    };
    const sRes = await fetch(`${url}/rest/v1/sales`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }), body: JSON.stringify(saleRow),
    });
    const sale = (await sRes.json())?.[0];

    // Convert contact → Customer + log timeline
    if (contactId) {
      await fetch(`${url}/rest/v1/contacts?id=eq.${contactId}&uid=eq.${uid}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ stage: "Customer (Won)" }),
      });
      await fetch(`${url}/rest/v1/activities`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, contact_id: contactId, type: "sale", content: `Sale recorded — ₹${total} (${status})`, meta: { saleId: sale?.id, total } }),
      });
    }

    return sRes.ok ? NextResponse.json({ ok: true, sale }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}
