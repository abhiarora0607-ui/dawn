// app/api/sales/route.ts
// Records a sale. If tied to a contact, converts them to Customer and logs
// it in their timeline. Also supports standalone sales (auto-creates a
// customer). This is the core lead→customer conversion loop.

import { NextResponse } from "next/server";
import { writeBlocked, requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { softDelete } from "@/lib/soft-delete";
import { ensureOwnerEmployee } from "@/lib/owner-employee";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ sales: [] });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const wantCustomers = new URL(req.url).searchParams.get("customers") === "1";
  try {
    if (wantCustomers) {
      // Return contacts that can receive an order (customers first, then anyone)
      // full-scan: name map for the orders view; paginate in V61
      const res = await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=id,name,phone,stage,employee_id&order=name.asc`, { headers: H(key), cache: "no-store" });
      return NextResponse.json({ customers: await res.json() });
    }
    const res = await fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&order=date.desc`, { headers: H(key), cache: "no-store" });
    return NextResponse.json({ sales: await res.json() });
  } catch { return NextResponse.json({ sales: [] }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    // Order status update — but "Cancelled" is a special, guarded transition.
    if (b.orderStatus && b.orderStatus !== "Cancelled") {
      await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ order_status: b.orderStatus }),
      });
      return NextResponse.json({ ok: true });
    }

    // ------------------------------------------------------------- CANCEL
    // Admin-only (this route is the owner API), reason required, and any money
    // already paid must be explicitly reconciled — refunded or retained.
    if (b.cancel) {
      const reason = (b.cancelReason || "").trim();
      if (!reason) return NextResponse.json({ error: "A reason is required to cancel an order." }, { status: 400 });
      const s = (await (await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
      if (!s) return NextResponse.json({ error: "Not found." }, { status: 404 });
      if (s.order_status === "Cancelled") return NextResponse.json({ error: "This order is already cancelled." }, { status: 400 });

      const paid = Number(s.amount_paid) || 0;
      let disposition = "none";
      const patch: any = { order_status: "Cancelled", cancel_reason: reason.slice(0, 500), cancelled_at: new Date().toISOString(), balance: 0 };

      if (paid > 0) {
        // Money changed hands — the admin must say what happened to it.
        if (b.disposition !== "refunded" && b.disposition !== "retained") {
          return NextResponse.json({ error: "This order has payments. Choose whether they were refunded or retained.", needsDisposition: true, paid }, { status: 400 });
        }
        disposition = b.disposition;
        if (disposition === "refunded") {
          // Revenue reverses: log a refund expense and zero the collected amount.
          await fetch(`${url}/rest/v1/expenses`, {
            method: "POST", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify({ uid, date: new Date().toISOString().slice(0, 10), category: "Refund", amount: paid, note: `Refund for cancelled order #${String(s.id).slice(0, 8)}`, source: "refund", source_id: s.id }),
          });
        }
        // "retained" keeps amount_paid as-is (kept as credit/deposit).
      }
      patch.payment_disposition = disposition;

      // Reverse the cost of goods — you didn't incur the cost of a cancelled sale.
      await fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&source=eq.order&source_id=eq.${s.id}`, { method: "DELETE", headers: H(key) });

      await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}`, { method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch) });

      if (s.contact_id) {
        await fetch(`${url}/rest/v1/activities`, {
          method: "POST", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ uid, contact_id: s.contact_id, type: "note", content: `Order cancelled — ${reason.slice(0, 300)}${paid > 0 ? ` (payment ${disposition})` : ""}` }),
        });
      }
      await audit({ uid, action: "order.cancel", entity: "sales", entityId: s.id, meta: { reason, disposition, paid } });
      return NextResponse.json({ ok: true, disposition });
    }

    // Add payment
    const cur = await (await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json();
    const sale = cur?.[0];
    if (!sale) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const addAmount = Number(b.addPayment) || 0;
    if (addAmount <= 0) return NextResponse.json({ error: "Enter a valid payment amount." }, { status: 400 });
    const curBalance = Math.max(0, Number(sale.total) - (Number(sale.amount_paid) || 0));
    if (addAmount > curBalance + 0.001) return NextResponse.json({ error: "Payment can't exceed the balance due." }, { status: 400 });
    const newPaid = Math.min(Number(sale.total), (Number(sale.amount_paid) || 0) + addAmount);
    const newBalance = Math.max(0, Number(sale.total) - newPaid);
    const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : "pending";
    const payments = [...(sale.payments || []), { amount: addAmount, date: new Date().toISOString(), method: b.method || "cash" }];

    await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ amount_paid: newPaid, balance: newBalance, status: newStatus, payments, ...(newStatus !== "pending" && !sale.payment_method ? { payment_method: b.method || "cash" } : {}) }),
    });
    if (sale.contact_id) {
      await fetch(`${url}/rest/v1/activities`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, contact_id: sale.contact_id, type: "sale", content: `Payment received: ₹${addAmount} (${b.method || "cash"})`, meta: { saleId: sale.id } }),
      });
    }
    await audit({ uid, action: "order.payment", entity: "sales", entityId: sale.id, meta: { amount: addAmount, method: b.method || "cash", newStatus } });
    return NextResponse.json({ ok: true, status: newStatus, balance: newBalance });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    // Soft-delete the order and its linked cost expense together, so finance
    // stays correct and both come back on restore.
    await fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&source=eq.order&source_id=eq.${id}`, {
      method: "PATCH", headers: { ...H(key), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    await softDelete(url, key, "sales", id, uid);
    await audit({ uid, action: "order.delete", entity: "sales", entityId: id, meta: { soft: true } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });

  try {
    const b = await req.json();
    const rawItems = b.items || [];
    // Bound each line so a typo can't create an absurd order.
    const items = (Array.isArray(rawItems) ? rawItems : []).map((it: any) => ({
      ...it,
      qty: Math.min(100000, Math.max(1, Math.floor(Number(it.qty) || 1))),
      unitPrice: Math.min(100000000, Math.max(0, Number(it.unitPrice) || 0)),
    }));
    const subtotal = items.reduce((s: number, it: any) => s + it.unitPrice * it.qty, 0);
    const discount = Math.max(0, Number(b.discount) || 0);
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
      fixed_cost: Number(b.orderCost) || 0,
      employee_id: b.employeeId || (await ensureOwnerEmployee(url!, key!, uid)),
      order_status: "Placed",
    };
    const sRes = await fetch(`${url}/rest/v1/sales`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }), body: JSON.stringify(saleRow),
    });
    const sale = (await sRes.json())?.[0];

    // Order cost (sum of item costs × qty) → linked expense (auto-removed on delete)
    if (sale?.id && Number(b.orderCost) > 0) {
      await fetch(`${url}/rest/v1/expenses`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, date: new Date().toISOString().slice(0, 10), category: "Cost of goods", amount: Number(b.orderCost), note: `Item cost for order #${String(sale.id).slice(0, 8)}`, source: "order", source_id: sale.id }),
      });
    }

    // Convert contact → Customer + log timeline. Also stamp the handling
    // employee onto the contact so future orders auto-fill.
    if (contactId) {
      const contactPatch: any = { stage: "Customer (Won)" };
      if (b.employeeId) contactPatch.employee_id = b.employeeId;
      await fetch(`${url}/rest/v1/contacts?id=eq.${contactId}&uid=eq.${uid}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify(contactPatch),
      });
      await fetch(`${url}/rest/v1/activities`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, contact_id: contactId, type: "sale", content: `Sale recorded — ₹${total} (${status})`, meta: { saleId: sale?.id, total } }),
      });
    }

    if (sale?.id) await audit({ uid, action: "order.create", entity: "sales", entityId: sale.id, meta: { total, status } });
    return sRes.ok ? NextResponse.json({ ok: true, sale }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}
