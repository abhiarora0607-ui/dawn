// app/api/team/orders/route.ts
// Employee-scoped orders. Employees create orders only for THEIR customers,
// and every order is stamped with their employee_id. Mirrors the owner sales
// logic (revenue = amount paid, item cost → expense) but ownership-locked.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee("orders");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const rows = await (await fetch(`${url}/rest/v1/sales?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=date.desc`, { headers: empHeaders(key), cache: "no-store" })).json();
    return NextResponse.json({ orders: Array.isArray(rows) ? rows : [] });
  } catch { return NextResponse.json({ orders: [] }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee("orders");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    let contactId = b.contactId || null;

    // If an existing contact is used, it MUST belong to this employee.
    if (contactId) {
      const owned = (await (await fetch(`${url}/rest/v1/contacts?id=eq.${contactId}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=id&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
      if (!owned) return NextResponse.json({ error: "That customer isn't yours." }, { status: 403 });
    }

    const items = b.items || [];
    const subtotal = items.reduce((s: number, it: any) => s + (Number(it.unitPrice) || 0) * (Number(it.qty) || 1), 0);
    const discount = Number(b.discount) || 0;
    const total = Math.max(0, subtotal - discount);
    const amountPaid = Number(b.amountPaid) || 0;
    const balance = Math.max(0, total - amountPaid);
    const status = balance <= 0 ? "paid" : amountPaid > 0 ? "partial" : "pending";
    const orderCost = items.reduce((s: number, it: any) => s + (Number(it.cost) || 0) * (Number(it.qty) || 1), 0);

    // Walk-in → create a customer owned by this employee.
    if (!contactId && b.customerName) {
      const cRes = await fetch(`${url}/rest/v1/contacts`, {
        method: "POST", headers: empHeaders(key, { Prefer: "return=representation" }),
        body: JSON.stringify({ uid: ctx.uid, name: b.customerName, phone: b.customerPhone || "", source: "Walk-in", stage: "Customer (Won)", employee_id: ctx.employeeId }),
      });
      contactId = (await cRes.json())?.[0]?.id || null;
    }

    const sRes = await fetch(`${url}/rest/v1/sales`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=representation" }),
      body: JSON.stringify({
        uid: ctx.uid, contact_id: contactId, items, subtotal, discount, total,
        amount_paid: amountPaid, balance, payment_method: status === "pending" ? "" : (b.paymentMethod || "cash"),
        status, payments: amountPaid > 0 ? [{ amount: amountPaid, date: new Date().toISOString(), method: b.paymentMethod || "cash" }] : [],
        notes: b.notes || "", fixed_cost: orderCost, employee_id: ctx.employeeId, order_status: "Placed",
      }),
    });
    const sale = (await sRes.json())?.[0];

    if (sale?.id && orderCost > 0) {
      await fetch(`${url}/rest/v1/expenses`, {
        method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid: ctx.uid, date: new Date().toISOString().slice(0, 10), category: "Cost of goods", amount: orderCost, note: `Item cost for order #${String(sale.id).slice(0, 8)}`, source: "order", source_id: sale.id }),
      });
    }
    if (contactId) {
      await fetch(`${url}/rest/v1/contacts?id=eq.${contactId}&uid=eq.${ctx.uid}`, { method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ stage: "Customer (Won)" }) });
      await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid: ctx.uid, contact_id: contactId, type: "sale", content: `Order ₹${total} by ${ctx.name || "employee"}`, meta: { saleId: sale?.id } }) });
    }
    if (sale?.id) await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "order.create", entity: "sales", entityId: sale.id, meta: { total } });
    return NextResponse.json({ ok: true, order: sale });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const g = await guardEmployee("edit_orders");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const owned = (await (await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
    if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (b.orderStatus) {
      await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, { method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ order_status: b.orderStatus }) });
      await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "order.status", entity: "sales", entityId: b.id, meta: { status: b.orderStatus } });
      return NextResponse.json({ ok: true });
    }

    // Record a payment against the balance.
    if (b.addPayment !== undefined) {
      const addAmount = Number(b.addPayment) || 0;
      if (addAmount <= 0) return NextResponse.json({ error: "Enter a valid payment amount." }, { status: 400 });
      const curBalance = Math.max(0, Number(owned.total) - (Number(owned.amount_paid) || 0));
      if (addAmount > curBalance + 0.001) return NextResponse.json({ error: "Payment can't exceed the balance due." }, { status: 400 });
      const newPaid = Math.min(Number(owned.total), (Number(owned.amount_paid) || 0) + addAmount);
      const newBalance = Math.max(0, Number(owned.total) - newPaid);
      const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : "pending";
      const payments = [...(owned.payments || []), { amount: addAmount, date: new Date().toISOString(), method: b.method || "cash", by: ctx.employeeId }];
      await fetch(`${url}/rest/v1/sales?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
        method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ amount_paid: newPaid, balance: newBalance, status: newStatus, payments, ...(newStatus !== "pending" && !owned.payment_method ? { payment_method: b.method || "cash" } : {}) }),
      });
      if (owned.contact_id) {
        await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid: ctx.uid, contact_id: owned.contact_id, type: "sale", content: `Payment received: ₹${addAmount} (${b.method || "cash"}) by ${ctx.name || "employee"}`, meta: { saleId: b.id } }) });
      }
      await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "order.payment", entity: "sales", entityId: b.id, meta: { amount: addAmount, newStatus } });
      return NextResponse.json({ ok: true, status: newStatus, balance: newBalance });
    }
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}
