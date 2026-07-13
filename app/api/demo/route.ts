// app/api/demo/route.ts
// Seeds a COMPLETE working business so the whole CRM can be evaluated at once:
// employees, price list, contacts across every stage, orders with payments and
// statuses, expenses, tasks and notes. Every row is tagged is_demo=true, so
// clearing removes exactly what this created and nothing real.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { ensureOwnerEmployee } from "@/lib/owner-employee";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
const rep = (key: string) => H(key, { Prefer: "return=representation" });
const min = (key: string) => H(key, { Prefer: "return=minimal" });

// Tables that carry demo rows, in delete order (children before parents).
const DEMO_TABLES = ["tasks", "emp_notes", "sales", "expenses", "catalog_items", "contacts", "employees"];

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function daysAhead(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

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
      for (const t of DEMO_TABLES) {
        // The owner-employee is never demo data, but guard it anyway.
        const extra = t === "employees" ? "&is_owner=is.false" : "";
        await fetch(`${url}/rest/v1/${t}?uid=eq.${uid}&is_demo=is.true${extra}`, { method: "DELETE", headers: H(key) });
      }
      return NextResponse.json({ ok: true, cleared: true });
    } catch { return NextResponse.json({ error: "Clear failed." }, { status: 500 }); }
  }

  // ----------------------------------------------------------------- SEED
  try {
    const ownerEmp = await ensureOwnerEmployee(url, key, uid);

    // 1) Employees — a small sales team.
    const empRows = await (await fetch(`${url}/rest/v1/employees`, {
      method: "POST", headers: rep(key),
      body: JSON.stringify([
        { uid, name: "Priya Sharma", role: "Sales", phone: "9876543210", status: "active", salary: 22000, joining_date: daysAgo(240), is_demo: true },
        { uid, name: "Rahul Verma", role: "Sales", phone: "9811122233", status: "active", salary: 20000, joining_date: daysAgo(120), is_demo: true },
      ]),
    })).json();
    const priya = empRows?.[0]?.id || ownerEmp;
    const rahul = empRows?.[1]?.id || ownerEmp;

    // 2) Price list.
    const itemRows = await (await fetch(`${url}/rest/v1/catalog_items`, {
      method: "POST", headers: rep(key),
      body: JSON.stringify([
        { uid, name: "Cold-pressed green juice", category: "Juices", price: 250, cost: 90, unit: "per item", type: "product", is_active: true, is_demo: true },
        { uid, name: "Detox sampler pack (6)", category: "Bundles", price: 1290, compare_at_price: 1500, cost: 540, unit: "per item", type: "product", is_active: true, is_demo: true },
        { uid, name: "Monthly juice subscription", category: "Subscriptions", price: 4999, cost: 2100, unit: "per month", type: "service", is_active: true, is_demo: true },
        { uid, name: "1:1 nutrition consult", category: "Services", price: 799, cost: 0, unit: "per session", type: "service", is_active: true, is_demo: true },
        { uid, name: "Reusable glass bottle", category: "Merch", price: 349, cost: 140, unit: "per item", type: "product", is_active: true, is_demo: true },
      ]),
    })).json();
    const item = (i: number) => itemRows?.[i] || {};

    // 3) Contacts across EVERY stage, split between the two employees.
    const contactRows = await (await fetch(`${url}/rest/v1/contacts`, {
      method: "POST", headers: rep(key),
      body: JSON.stringify([
        { uid, name: "Ananya Iyer", phone: "9820011223", instagram_handle: "ananya.eats", source: "Instagram DM", stage: "New Lead", employee_id: priya, follow_up_date: daysAhead(1), is_demo: true },
        { uid, name: "Vikram Nair", phone: "9930022114", instagram_handle: "vik.fitness", source: "Instagram DM", stage: "New Lead", employee_id: rahul, is_demo: true },
        { uid, name: "Sneha Kulkarni", phone: "9845566778", source: "Referral", stage: "Contacted", employee_id: priya, follow_up_date: daysAgo(1), is_demo: true },
        { uid, name: "Arjun Mehta", phone: "9700088990", instagram_handle: "arjun.lifts", source: "WhatsApp", stage: "Contacted", employee_id: rahul, follow_up_date: daysAhead(3), is_demo: true },
        { uid, name: "Divya Rao", phone: "9611223344", source: "Website", stage: "Negotiating", employee_id: priya, follow_up_date: daysAhead(0), is_demo: true },
        { uid, name: "Karan Malhotra", phone: "9555667788", instagram_handle: "karan.wellness", source: "Instagram DM", stage: "Negotiating", employee_id: rahul, is_demo: true },
        { uid, name: "Meera Joshi", phone: "9822334455", instagram_handle: "meera.glow", source: "Instagram DM", stage: "Customer (Won)", employee_id: priya, is_demo: true },
        { uid, name: "Rohit Desai", phone: "9733445566", source: "Referral", stage: "Customer (Won)", employee_id: rahul, is_demo: true },
        { uid, name: "Farah Khan", phone: "9644556677", source: "Walk-in", stage: "Customer (Won)", employee_id: priya, is_demo: true },
        { uid, name: "Sameer Gupta", phone: "9566778899", source: "Website", stage: "Lost", employee_id: rahul, lost_reason: "Went with a cheaper local supplier", is_demo: true },
        { uid, name: "Tanvi Shah", phone: "9877889900", instagram_handle: "tanvi.co", source: "Instagram DM", stage: "Lost", employee_id: priya, lost_reason: "Budget cut - asked us to follow up next quarter", is_demo: true },
      ]),
    })).json();
    const C = (n: string) => (contactRows || []).find((c: any) => c.name === n) || {};
    const meera = C("Meera Joshi"), rohit = C("Rohit Desai"), farah = C("Farah Khan");

    // 4) Orders — paid, partially paid, and unpaid, across order statuses.
    await fetch(`${url}/rest/v1/sales`, {
      method: "POST", headers: min(key),
      body: JSON.stringify([
        {
          uid, contact_id: meera.id, customer_name: meera.name, employee_id: priya, date: daysAgo(20),
          items: [{ itemId: item(2).id, name: item(2).name, qty: 1, unitPrice: 4999, cost: 2100 }],
          total: 4999, amount_paid: 4999, balance: 0, status: "paid", payment_method: "upi", order_status: "Delivered",
          payments: [{ amount: 4999, date: new Date(Date.now() - 20 * 86400000).toISOString(), method: "upi" }], is_demo: true,
        },
        {
          uid, contact_id: meera.id, customer_name: meera.name, employee_id: priya, date: daysAgo(4),
          items: [{ itemId: item(1).id, name: item(1).name, qty: 2, unitPrice: 1290, cost: 540 }],
          total: 2580, amount_paid: 1000, balance: 1580, status: "partial", payment_method: "cash", order_status: "Shipped",
          payments: [{ amount: 1000, date: new Date(Date.now() - 4 * 86400000).toISOString(), method: "cash" }], is_demo: true,
        },
        {
          uid, contact_id: rohit.id, customer_name: rohit.name, employee_id: rahul, date: daysAgo(9),
          items: [{ itemId: item(0).id, name: item(0).name, qty: 10, unitPrice: 250, cost: 90 }, { itemId: item(4).id, name: item(4).name, qty: 1, unitPrice: 349, cost: 140 }],
          total: 2849, amount_paid: 2849, balance: 0, status: "paid", payment_method: "card", order_status: "Delivered",
          payments: [{ amount: 2849, date: new Date(Date.now() - 9 * 86400000).toISOString(), method: "card" }], is_demo: true,
        },
        {
          uid, contact_id: farah.id, customer_name: farah.name, employee_id: priya, date: daysAgo(1),
          items: [{ itemId: item(3).id, name: item(3).name, qty: 1, unitPrice: 799, cost: 0 }],
          total: 799, amount_paid: 0, balance: 799, status: "pending", order_status: "Placed", payments: [], is_demo: true,
        },
      ]),
    });

    // 5) Activity timelines so contacts have history.
    await fetch(`${url}/rest/v1/activities`, {
      method: "POST", headers: min(key),
      body: JSON.stringify([
        { uid, contact_id: meera.id, type: "note", content: "Asked about pausing the subscription over the holidays" },
        { uid, contact_id: meera.id, type: "stage_change", content: "Moved to Customer (Won)" },
        { uid, contact_id: rohit.id, type: "note", content: "Referred by an existing customer - wants bulk pricing" },
        { uid, contact_id: C("Divya Rao").id, type: "note", content: "Negotiating on the 6-pack bundle; wants free delivery" },
        { uid, contact_id: C("Sneha Kulkarni").id, type: "note", content: "Called once, no answer. Follow up." },
      ]),
    });

    // 6) Expenses.
    await fetch(`${url}/rest/v1/expenses`, {
      method: "POST", headers: min(key),
      body: JSON.stringify([
        { uid, title: "Instagram ads", category: "Marketing", amount: 3500, date: daysAgo(12), is_demo: true },
        { uid, title: "Packaging supplies", category: "Supplies", amount: 1800, date: daysAgo(7), is_demo: true },
        { uid, title: "Delivery fuel", category: "Logistics", amount: 900, date: daysAgo(3), is_demo: true },
      ]),
    });

    // 7) Tasks and notes for the team.
    await fetch(`${url}/rest/v1/tasks`, {
      method: "POST", headers: min(key),
      body: JSON.stringify([
        { uid, employee_id: priya, title: "Call Divya about the bundle discount", due_date: daysAhead(0), contact_id: C("Divya Rao").id, is_demo: true },
        { uid, employee_id: priya, title: "Collect the balance from Meera", due_date: daysAgo(1), is_demo: true },
        { uid, employee_id: rahul, title: "Send the catalogue to Karan", due_date: daysAhead(2), is_demo: true },
        { uid, employee_id: rahul, title: "Restock glass bottles", due_date: daysAhead(5), done: true, is_demo: true },
      ]),
    });
    await fetch(`${url}/rest/v1/emp_notes`, {
      method: "POST", headers: min(key),
      body: JSON.stringify([
        { uid, employee_id: priya, body: "Meera wants delivery only on weekends - check before dispatch.", is_demo: true },
        { uid, employee_id: rahul, body: "Karan is price-sensitive. Lead with the sampler, not the subscription.", is_demo: true },
      ]),
    });

    return NextResponse.json({ ok: true, seeded: true });
  } catch {
    return NextResponse.json({ error: "Seed failed. Make sure V7_UPDATES.sql has been run." }, { status: 500 });
  }
}
