// app/api/demo/route.ts
// Seeds a COMPLETE working business — every object in the CRM, at least 3-4
// records each — so the whole product can be evaluated at once. Every row is
// tagged is_demo=true, so clearing removes exactly what this created and never
// touches real data or the permanent owner-employee record.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { ensureOwnerEmployee } from "@/lib/owner-employee";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

// Insert and FAIL LOUDLY. A seed that half-works silently is worse than one
// that says exactly which table rejected which column.
//
// PostgREST rejects a bulk insert unless EVERY row has the same key set
// (PGRST102), so we union all keys across the batch and fill the gaps with
// null before sending.
async function insert(url: string, key: string, table: string, rows: any[], want = false): Promise<any> {
  const allKeys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const normalized = rows.map((r) => {
    const out: any = {};
    for (const k of allKeys) out[k] = r[k] === undefined ? null : r[k];
    return out;
  });
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: H(key, { Prefer: want ? "return=representation" : "return=minimal" }),
    body: JSON.stringify(normalized),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${table} — ${detail.slice(0, 250)}`);
  }
  return want ? await res.json() : null;
}

// Delete order matters: children before parents.
const DEMO_TABLES = ["tasks", "emp_notes", "sales", "expenses", "catalog_items", "contacts", "employees"];

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function daysAhead(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function iso(n: number) { return new Date(Date.now() - n * 86400000).toISOString(); }

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const action = new URL(req.url).searchParams.get("action");

  // ---------------------------------------------------------------- CLEAR
  if (action === "clear") {
    try {
      const demoContacts = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&is_demo=is.true&select=id`, { headers: H(key), cache: "no-store" })).json();
      for (const c of Array.isArray(demoContacts) ? demoContacts : []) {
        await fetch(`${url}/rest/v1/activities?uid=eq.${uid}&contact_id=eq.${c.id}`, { method: "DELETE", headers: H(key) });
      }
      // Demo employees may have recurring salary rows — remove those too.
      const demoEmps = await (await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&is_demo=is.true&select=id`, { headers: H(key), cache: "no-store" })).json();
      for (const e of Array.isArray(demoEmps) ? demoEmps : []) {
        await fetch(`${url}/rest/v1/recurring_expenses?uid=eq.${uid}&employee_id=eq.${e.id}`, { method: "DELETE", headers: H(key) });
      }
      for (const t of DEMO_TABLES) {
        // Never touch the permanent owner record.
        const guard = t === "employees" ? "&is_owner=is.false" : "";
        await fetch(`${url}/rest/v1/${t}?uid=eq.${uid}&is_demo=is.true${guard}`, { method: "DELETE", headers: H(key) });
      }
      return NextResponse.json({ ok: true, cleared: true });
    } catch (e: any) {
      return NextResponse.json({ error: `Clear failed. ${e?.message || ""}` }, { status: 500 });
    }
  }

  // ----------------------------------------------------------------- SEED
  try {
    const ownerEmp = await ensureOwnerEmployee(url, key, uid);

    // 1) EMPLOYEES (3)
    const emps = await insert(url, key, "employees", [
      { uid, name: "Priya Sharma", role: "Sales", phone: "9876543210", email: "priya@example.com", status: "active", monthly_salary: 22000, joining_date: daysAgo(240), is_demo: true },
      { uid, name: "Rahul Verma", role: "Sales", phone: "9811122233", email: "rahul@example.com", status: "active", monthly_salary: 20000, joining_date: daysAgo(120), is_demo: true },
      { uid, name: "Neha Bhatt", role: "Support", phone: "9700011122", email: "neha@example.com", status: "active", monthly_salary: 18000, joining_date: daysAgo(60), is_demo: true },
    ], true);
    const priya = emps?.[0]?.id || ownerEmp;
    const rahul = emps?.[1]?.id || ownerEmp;
    const neha = emps?.[2]?.id || ownerEmp;

    // 2) PRICE LIST (5)
    const items = await insert(url, key, "catalog_items", [
      { uid, name: "Cold-pressed green juice", category: "Juices", price: 250, cost: 90, compare_at_price: null, unit: "per item", type: "product", is_active: true, is_demo: true },
      { uid, name: "Detox sampler pack (6)", category: "Bundles", price: 1290, cost: 540, compare_at_price: 1500, unit: "per item", type: "product", is_active: true, is_demo: true },
      { uid, name: "Monthly juice subscription", category: "Subscriptions", price: 4999, cost: 2100, unit: "per month", type: "service", is_active: true, is_demo: true },
      { uid, name: "1:1 nutrition consult", category: "Services", price: 799, cost: 0, unit: "per session", type: "service", is_active: true, is_demo: true },
      { uid, name: "Reusable glass bottle", category: "Merch", price: 349, cost: 140, unit: "per item", type: "product", is_active: true, is_demo: true },
    ], true);
    const it = (i: number) => items?.[i] || {};

    // 3) CONTACTS (11 — every stage represented)
    const contacts = await insert(url, key, "contacts", [
      { uid, name: "Ananya Iyer", phone: "9820011223", instagram_handle: "ananya.eats", source: "Instagram DM", stage: "New Lead", employee_id: priya, follow_up_date: daysAhead(1), is_demo: true },
      { uid, name: "Vikram Nair", phone: "9930022114", instagram_handle: "vik.fitness", source: "Instagram DM", stage: "New Lead", employee_id: rahul, is_demo: true },
      { uid, name: "Ishaan Kapoor", phone: "9977001122", source: "Website", stage: "New Lead", employee_id: neha, follow_up_date: daysAhead(2), is_demo: true },
      { uid, name: "Sneha Kulkarni", phone: "9845566778", source: "Referral", stage: "Contacted", employee_id: priya, follow_up_date: daysAgo(1), is_demo: true },
      { uid, name: "Arjun Mehta", phone: "9700088990", instagram_handle: "arjun.lifts", source: "WhatsApp", stage: "Contacted", employee_id: rahul, follow_up_date: daysAhead(3), is_demo: true },
      { uid, name: "Divya Rao", phone: "9611223344", source: "Website", stage: "Negotiating", employee_id: priya, follow_up_date: daysAhead(0), is_demo: true },
      { uid, name: "Karan Malhotra", phone: "9555667788", instagram_handle: "karan.wellness", source: "Instagram DM", stage: "Negotiating", employee_id: rahul, is_demo: true },
      { uid, name: "Meera Joshi", phone: "9822334455", instagram_handle: "meera.glow", source: "Instagram DM", stage: "Customer (Won)", employee_id: priya, is_demo: true },
      { uid, name: "Rohit Desai", phone: "9733445566", source: "Referral", stage: "Customer (Won)", employee_id: rahul, is_demo: true },
      { uid, name: "Farah Khan", phone: "9644556677", source: "Walk-in", stage: "Customer (Won)", employee_id: neha, is_demo: true },
      { uid, name: "Sameer Gupta", phone: "9566778899", source: "Website", stage: "Lost", employee_id: rahul, lost_reason: "Went with a cheaper local supplier", is_demo: true },
      { uid, name: "Tanvi Shah", phone: "9877889900", instagram_handle: "tanvi.co", source: "Instagram DM", stage: "Lost", employee_id: priya, lost_reason: "Budget cut - asked us to follow up next quarter", is_demo: true },
    ], true);
    const C = (n: string) => (contacts || []).find((c: any) => c.name === n) || {};
    const meera = C("Meera Joshi"), rohit = C("Rohit Desai"), farah = C("Farah Khan");

    // 4) ORDERS (4 — paid, partial, unpaid, across fulfilment stages)
    await insert(url, key, "sales", [
      {
        uid, contact_id: meera.id, employee_id: priya, date: daysAgo(20),
        items: [{ itemId: it(2).id, name: it(2).name, qty: 1, unitPrice: 4999 }],
        total: 4999, amount_paid: 4999, balance: 0, status: "paid", payment_method: "upi", order_status: "Delivered",
        payments: [{ amount: 4999, date: iso(20), method: "upi" }], is_demo: true,
      },
      {
        uid, contact_id: meera.id, employee_id: priya, date: daysAgo(4),
        items: [{ itemId: it(1).id, name: it(1).name, qty: 2, unitPrice: 1290 }],
        total: 2580, amount_paid: 1000, balance: 1580, status: "partial", payment_method: "cash", order_status: "Shipped",
        payments: [{ amount: 1000, date: iso(4), method: "cash" }], is_demo: true,
      },
      {
        uid, contact_id: rohit.id, employee_id: rahul, date: daysAgo(9),
        items: [{ itemId: it(0).id, name: it(0).name, qty: 10, unitPrice: 250 }, { itemId: it(4).id, name: it(4).name, qty: 1, unitPrice: 349 }],
        total: 2849, amount_paid: 2849, balance: 0, status: "paid", payment_method: "card", order_status: "Delivered",
        payments: [{ amount: 2849, date: iso(9), method: "card" }], is_demo: true,
      },
      {
        uid, contact_id: farah.id, employee_id: neha, date: daysAgo(1),
        items: [{ itemId: it(3).id, name: it(3).name, qty: 1, unitPrice: 799 }],
        total: 799, amount_paid: 0, balance: 799, status: "pending", order_status: "Placed", payments: [], is_demo: true,
      },
    ]);

    // 5) ACTIVITY TIMELINES (5)
    await insert(url, key, "activities", [
      { uid, contact_id: meera.id, type: "note", content: "Asked about pausing the subscription over the holidays" },
      { uid, contact_id: meera.id, type: "stage_change", content: "Moved to Customer (Won)" },
      { uid, contact_id: rohit.id, type: "note", content: "Referred by an existing customer - wants bulk pricing" },
      { uid, contact_id: C("Divya Rao").id, type: "note", content: "Negotiating on the 6-pack bundle; wants free delivery" },
      { uid, contact_id: C("Sneha Kulkarni").id, type: "note", content: "Called once, no answer. Follow up." },
    ]);

    // 6) EXPENSES (4)
    await insert(url, key, "expenses", [
      { uid, note: "Instagram ads", category: "Marketing", amount: 3500, date: daysAgo(12), is_demo: true },
      { uid, note: "Packaging supplies", category: "Supplies", amount: 1800, date: daysAgo(7), is_demo: true },
      { uid, note: "Cold storage rent", category: "Rent", amount: 6000, date: daysAgo(15), is_demo: true },
      { uid, note: "Delivery fuel", category: "Logistics", amount: 900, date: daysAgo(3), is_demo: true },
    ]);

    // 7) TASKS (5 — one overdue, one done)
    await insert(url, key, "tasks", [
      { uid, employee_id: priya, title: "Call Divya about the bundle discount", due_date: daysAhead(0), contact_id: C("Divya Rao").id, done: false, is_demo: true },
      { uid, employee_id: priya, title: "Collect the pending balance from Meera", due_date: daysAgo(1), contact_id: null, done: false, is_demo: true },
      { uid, employee_id: rahul, title: "Send the catalogue to Karan", due_date: daysAhead(2), contact_id: null, done: false, is_demo: true },
      { uid, employee_id: rahul, title: "Restock glass bottles", due_date: daysAhead(5), contact_id: null, done: true, is_demo: true },
      { uid, employee_id: neha, title: "Confirm Farah's delivery address", due_date: daysAhead(1), contact_id: null, done: false, is_demo: true },
    ]);

    // 8) NOTES (4)
    await insert(url, key, "emp_notes", [
      { uid, employee_id: priya, body: "Meera wants delivery only on weekends - check before dispatch.", is_demo: true },
      { uid, employee_id: rahul, body: "Karan is price-sensitive. Lead with the sampler, not the subscription.", is_demo: true },
      { uid, employee_id: neha, body: "Walk-in customers keep asking for the glass bottle - suggest reordering.", is_demo: true },
      { uid, employee_id: priya, body: "Referrals convert best. Ask happy customers for one after delivery.", is_demo: true },
    ]);

    return NextResponse.json({ ok: true, seeded: true });
  } catch (e: any) {
    const why = String(e?.message || "");
    const missingCol = /column .* does not exist|schema cache/i.test(why);
    return NextResponse.json({
      error: missingCol
        ? `The database is missing a column — run V8_UPDATES.sql in Supabase, then try again. (${why})`
        : `Seed failed — ${why}`,
    }, { status: 500 });
  }
}
