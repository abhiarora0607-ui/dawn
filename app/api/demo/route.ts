// app/api/demo/route.ts
// Seeds a COMPLETE working business — every object in the CRM, at least 3-4
// records each — so the whole product can be evaluated at once. Every row is
// tagged is_demo=true, so clearing removes exactly what this created and never
// touches real data or the permanent owner-employee record.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
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
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const action = new URL(req.url).searchParams.get("action");

  // ---------------------------------------------------------------- CLEAR
  if (action === "clear") {
    try {
      // V45: clearing goes through the shared lifecycle map. The list here used
      // to be maintained by hand and had fallen six tables behind — payslips,
      // leave requests, balances, bonuses, encashments and portal logins were
      // all left pointing at employees that had just been deleted. One map,
      // shared with the reset tool, so adding a table means updating one place.
      const { wipeRecords } = await import("@/lib/data-lifecycle-db");
      const result = await wipeRecords(url, key, uid, "demo");

      // The demo holiday isn't tagged — it's identified by name.
      await fetch(`${url}/rest/v1/holidays?uid=eq.${uid}&name=eq.Local%20festival`,
        { method: "DELETE", headers: H(key) }).catch(() => {});

      return NextResponse.json({ ok: true, cleared: true, removed: result.total });

    } catch (e: any) {
      return NextResponse.json({ error: `Clear failed. ${e?.message || ""}` }, { status: 500 });
    }
  }

  // ----------------------------------------------------------------- SEED
  try {
    const ownerEmp = await ensureOwnerEmployee(url, key, uid);

    // 1) EMPLOYEES (3)
    const emps = await insert(url, key, "employees", [
      { uid, name: "Priya Sharma", role: "Sales", phone: "9876543210", email: "priya@example.com", status: "active", monthly_salary: 22000, joining_date: daysAgo(240), is_demo: true, shift_start: "09:30", shift_end: "18:30", weekly_offs: [0] },
      { uid, name: "Rahul Verma", role: "Sales", phone: "9811122233", email: "rahul@example.com", status: "active", monthly_salary: 20000, joining_date: daysAgo(120), is_demo: true, shift_start: "10:00", shift_end: "19:00", weekly_offs: [0] },
      { uid, name: "Neha Bhatt", role: "Support", phone: "9700011122", email: "neha@example.com", status: "active", monthly_salary: 18000, joining_date: daysAgo(60), is_demo: true, remote_permanent: true, weekly_offs: [0] },
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
      { uid, name: "Sneha Kulkarni", phone: "9845566778", source: "Referral", stage: "Contacted", employee_id: priya, follow_up_date: daysAhead(1), is_demo: true },
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
      { uid, employee_id: priya, title: "Collect the pending balance from Meera", due_date: daysAhead(1), contact_id: null, done: false, is_demo: true },
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

    // 9) ATTENDANCE (last 21 days) — so the attendance screens aren't a blank
    // grid on first look. Deliberately imperfect: a late arrival, a short day,
    // one forgotten punch-out and one off-site punch, because a demo where
    // everything is tidy teaches the owner nothing about what the flags mean.
    try {
      const IST = 330;
      const dayOf = (off: number) =>
        new Date(new Date(Date.now() - off * 86400000).getTime() + IST * 60000).toISOString().slice(0, 10);
      const at = (off: number, hhmm: string) => {
        const [h, m] = hhmm.split(":").map(Number);
        return new Date(new Date(`${dayOf(off)}T00:00:00Z`).getTime() + (h * 60 + m - IST) * 60000).toISOString();
      };

      const people = [
        { id: priya, inT: "09:32", outT: "18:35" },
        { id: rahul, inT: "10:14", outT: "19:05" },
        { id: neha, inT: "09:58", outT: "18:40" },
      ];
      const logs: any[] = [];
      for (let d = 1; d <= 21; d++) {
        const date = dayOf(d);
        if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;      // Sunday off
        people.forEach((p, idx) => {
          if (!p.id) return;
          if (d === 4 && idx === 1) return;                                  // Rahul absent once
          const late = d === 7 && idx === 0;                                 // Priya late once
          const short = d === 11 && idx === 2;                               // Neha half day
          const forgot = d === 9 && idx === 1;                               // Rahul forgot to punch out
          const offsite = d === 6 && idx === 0;                              // Priya punched off-site
          logs.push({
            uid, employee_id: p.id, work_date: date,
            punch_in: at(d, late ? "11:05" : p.inT),
            punch_out: forgot ? null : at(d, short ? "13:30" : p.outT),
            within_fence: !offsite,
            distance_m: offsite ? 620 : 20,
            source: "punch",
          });
        });
      }
      if (logs.length) await insert(url, key, "attendance_logs", logs);

      await insert(url, key, "holidays", [{ uid, holiday_date: dayOf(14), name: "Local festival" }]);
      if (rahul) {
        await insert(url, key, "regularization_requests", [{
          uid, employee_id: rahul, work_date: dayOf(9),
          proposed_logs: [{ in: "10:10", out: "19:00" }],
          reason: "Forgot to punch out before leaving for a delivery.",
          status: "pending",
        }]);
      }
    } catch { /* attendance demo data is a nicety, never a blocker */ }

    // ------------------------------------------------------------------
    // V45: give the demo an ORGANISATION, not just a list of people.
    // Without departments, reporting lines and payroll, the org chart is
    // empty, My Team says nobody reports to you, and the roles dropdown has
    // nothing to illustrate.
    // ------------------------------------------------------------------
    try {
      // Departments — enough to make the org page meaningful, few enough to
      // stay believable for a small business.
      const depts = await insert(url, key, "departments", [
        { uid, name: "Sales", head_employee_id: priya, sort_order: 0 },
        { uid, name: "Operations", head_employee_id: null, sort_order: 1 },
      ], true);
      const salesDept = depts?.[0]?.id || null;
      const opsDept = depts?.[1]?.id || null;

      // A shape with actual depth: Priya leads Sales with Rahul under her,
      // Neha sits in Operations reporting to the owner. That's the smallest
      // arrangement where "a lead sees their team" means anything.
      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${priya}`, {
        method: "PATCH", headers: H(key),
        body: JSON.stringify({ reports_to: ownerEmp, department_id: salesDept, job_title: "Sales Lead" }),
      }).catch(() => {});
      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${rahul}`, {
        method: "PATCH", headers: H(key),
        body: JSON.stringify({ reports_to: priya, department_id: salesDept, job_title: "Sales Executive" }),
      }).catch(() => {});
      await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${neha}`, {
        method: "PATCH", headers: H(key),
        body: JSON.stringify({ reports_to: ownerEmp, department_id: opsDept, job_title: "Support Executive" }),
      }).catch(() => {});

      // Portal logins with DIFFERENT roles, so the permission system is
      // visible rather than theoretical. Priya manages, Rahul sells, Neha
      // has the minimum.
      const { permissionsForRole } = await import("@/lib/roles");
      await insert(url, key, "employee_accounts", [
        { uid, employee_id: priya, login_id: "priya", password_hash: null, active: false,
          permissions: permissionsForRole("manager"), is_demo: true },
        { uid, employee_id: rahul, login_id: "rahul", password_hash: null, active: false,
          permissions: permissionsForRole("sales_rep"), is_demo: true },
        { uid, employee_id: neha, login_id: "neha", password_hash: null, active: false,
          permissions: permissionsForRole("support_staff"), is_demo: true },
      ], false);

      // Last month's payroll, in mixed states — a draft to approve, an
      // approved one to pay, and one already paid. A payroll screen with
      // nothing on it demonstrates nothing.
      const lastMonth = (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })();
      const slips = await insert(url, key, "payslips", [
        { uid, employee_id: priya, month: lastMonth, status: "paid",
          base_amount: 22000, additions: 0, deductions: 0, net_amount: 22000,
          paid_at: new Date().toISOString() },
        { uid, employee_id: rahul, month: lastMonth, status: "approved",
          base_amount: 20000, additions: 2000, deductions: 0, net_amount: 22000 },
        { uid, employee_id: neha, month: lastMonth, status: "draft",
          base_amount: 18000, additions: 0, deductions: 0, net_amount: 18000 },
      ], true);
      if (Array.isArray(slips)) {
        const lines: any[] = [];
        for (const sl of slips) {
          lines.push({ uid, payslip_id: sl.id, kind: "base", label: "Monthly salary", amount: sl.base_amount });
          if (Number(sl.additions) > 0) {
            lines.push({ uid, payslip_id: sl.id, kind: "bonus", label: "Bonus — good quarter", amount: sl.additions });
          }
        }
        if (lines.length) await insert(url, key, "payslip_lines", lines, false);
      }

      // A bonus waiting on approval, so the approve/reject path has something
      // in it.
      await insert(url, key, "bonus_requests", [
        { uid, employee_id: rahul, amount: 3000, reason: "Closed the Meera Joshi subscription",
          status: "pending", requested_by: priya },
      ], false);

      // Leave: one approved in the past, one pending for a lead to decide.
      await insert(url, key, "leave_requests", [
        { uid, employee_id: neha, code: "casual", from_date: daysAgo(9), to_date: daysAgo(9),
          days: 1, reason: "Family function", status: "approved" },
        { uid, employee_id: rahul, code: "sick", from_date: daysAhead(3), to_date: daysAhead(4),
          days: 2, reason: "Minor surgery, doctor advised rest", status: "pending" },
      ], false);
    } catch { /* the org layer is a demonstration aid, never a blocker */ }

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
