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

    // 1) EMPLOYEES (9) — a small business with real reporting depth so the
    // approval-escalation and org views have something to show. The first three
    // keep their ids and roles; six more add an admin, finance, a second lead,
    // and more team members. Tree is wired below once ids exist.
    const emps = await insert(url, key, "employees", [
      { uid, name: "Priya Sharma", role: "Sales", phone: "9876543210", email: "priya@example.com", status: "active", monthly_salary: 28000, joining_date: daysAgo(300), is_demo: true, job_title: "Sales Lead", shift_start: "09:30", shift_end: "18:30", weekly_offs: [0] },
      { uid, name: "Rahul Verma", role: "Sales", phone: "9811122233", email: "rahul@example.com", status: "active", monthly_salary: 20000, joining_date: daysAgo(200), is_demo: true, shift_start: "10:00", shift_end: "19:00", weekly_offs: [0] },
      { uid, name: "Neha Bhatt", role: "Support", phone: "9700011122", email: "neha@example.com", status: "active", monthly_salary: 18000, joining_date: daysAgo(120), is_demo: true, remote_permanent: true, weekly_offs: [0] },
      { uid, name: "Divya Nair", role: "Admin", phone: "9876500001", email: "divya@example.com", status: "active", monthly_salary: 45000, joining_date: daysAgo(400), is_demo: true, is_admin: true, job_title: "General Manager", shift_start: "09:30", shift_end: "18:30", weekly_offs: [0] },
      { uid, name: "Karan Iyer", role: "Finance", phone: "9876500002", email: "karan.f@example.com", status: "active", monthly_salary: 38000, joining_date: daysAgo(360), is_demo: true, job_title: "Finance", shift_start: "09:30", shift_end: "18:30", weekly_offs: [0] },
      { uid, name: "Vikram Singh", role: "Operations", phone: "9876500004", email: "vikram@example.com", status: "active", monthly_salary: 27000, joining_date: daysAgo(280), is_demo: true, job_title: "Operations Lead", shift_start: "09:00", shift_end: "18:00", weekly_offs: [0] },
      { uid, name: "Sneha Kulkarni", role: "Sales", phone: "9876500006", email: "sneha.k@example.com", status: "active", monthly_salary: 19000, joining_date: daysAgo(150), is_demo: true, shift_start: "10:00", shift_end: "19:00", weekly_offs: [0] },
      { uid, name: "Arjun Rao", role: "Operations", phone: "9876500008", email: "arjun.r@example.com", status: "active", monthly_salary: 17500, joining_date: daysAgo(90), is_demo: true, shift_start: "09:00", shift_end: "18:00", weekly_offs: [0] },
      { uid, name: "Fatima Sheikh", role: "Support", phone: "9876500009", email: "fatima.s@example.com", status: "active", monthly_salary: 16000, joining_date: daysAgo(45), is_demo: true, weekly_offs: [0] },
    ], true);
    const priya = emps?.[0]?.id || ownerEmp;
    const rahul = emps?.[1]?.id || ownerEmp;
    const neha = emps?.[2]?.id || ownerEmp;
    const divya = emps?.[3]?.id || ownerEmp;
    const karan = emps?.[4]?.id || ownerEmp;
    const vikram = emps?.[5]?.id || ownerEmp;
    const sneha = emps?.[6]?.id || ownerEmp;
    const arjun = emps?.[7]?.id || ownerEmp;
    const fatima = emps?.[8]?.id || ownerEmp;
    // All nine, for the history loops below.
    const allStaff = [priya, rahul, neha, divya, karan, vikram, sneha, arjun, fatima];
    const salaryOf: Record<string, number> = {
      [priya]: 28000, [rahul]: 20000, [neha]: 18000, [divya]: 45000, [karan]: 38000,
      [vikram]: 27000, [sneha]: 19000, [arjun]: 17500, [fatima]: 16000,
    };

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
        { id: divya, inT: "09:28", outT: "18:45" },
        { id: karan, inT: "09:35", outT: "18:38" },
        { id: vikram, inT: "09:02", outT: "18:10" },
        { id: sneha, inT: "10:05", outT: "19:02" },
        { id: arjun, inT: "09:06", outT: "18:12" },
        { id: fatima, inT: "09:50", outT: "18:30" },
      ];
      const logs: any[] = [];
      // Six weeks back, so attendance shows a real stretch, not a fortnight.
      for (let d = 1; d <= 42; d++) {
        const date = dayOf(d);
        if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) continue;      // Sunday off
        people.forEach((p, idx) => {
          if (!p.id) return;
          // A scattering of realistic anomalies rather than a perfect grid.
          if (d === 4 && idx === 1) return;                                  // Rahul absent once
          if (d === 25 && idx === 6) return;                                 // Sneha absent once
          const late = (d === 7 && idx === 0) || (d === 30 && idx === 4);     // a couple of late days
          const short = (d === 11 && idx === 2) || (d === 33 && idx === 8);   // a couple of half days
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
      // Departments — Sales, Operations, and Finance, headed by their leads.
      const depts = await insert(url, key, "departments", [
        { uid, name: "Sales", head_employee_id: priya, sort_order: 0, is_demo: true },
        { uid, name: "Operations", head_employee_id: vikram, sort_order: 1, is_demo: true },
        { uid, name: "Finance", head_employee_id: karan, sort_order: 2, is_demo: true },
      ], true);
      const salesDept = depts?.[0]?.id || null;
      const opsDept = depts?.[1]?.id || null;
      const finDept = depts?.[2]?.id || null;

      // The tree, with real depth:
      //   Divya (admin, top) → Karan (finance), Priya (Sales lead), Vikram (Ops lead)
      //   Priya → Rahul, Sneha        Vikram → Neha, Arjun, Farah
      // This is the smallest arrangement where a request can escalate PAST a
      // lead who lacks a permission and land on the admin — the V48b flow.
      const orgPlan: [string, string | null, string | null, string][] = [
        [divya, ownerEmp, null, "General Manager"],
        [karan, divya, finDept, "Finance"],
        [priya, divya, salesDept, "Sales Lead"],
        [vikram, divya, opsDept, "Operations Lead"],
        [rahul, priya, salesDept, "Sales Executive"],
        [sneha, priya, salesDept, "Sales Executive"],
        [neha, vikram, opsDept, "Support Executive"],
        [arjun, vikram, opsDept, "Operations Executive"],
        [fatima, vikram, opsDept, "Support Executive"],
      ];
      for (const [id, boss, dept, title] of orgPlan) {
        await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${id}`, {
          method: "PATCH", headers: H(key),
          body: JSON.stringify({ reports_to: boss, department_id: dept, job_title: title }),
        }).catch(() => {});
      }

      // Portal logins with DIFFERENT roles, so the permission system and the
      // approval escalation are visible rather than theoretical. Divya
      // administers, Karan holds finance, the two leads manage their teams,
      // the rest have role-appropriate minimums.
      const { permissionsForRole } = await import("@/lib/roles");
      await insert(url, key, "employee_accounts", [
        { uid, employee_id: divya, login_id: "divya", password_hash: null, active: false,
          permissions: permissionsForRole("administrator"), is_demo: true },
        { uid, employee_id: karan, login_id: "karan", password_hash: null, active: false,
          permissions: permissionsForRole("finance_manager"), is_demo: true },
        { uid, employee_id: priya, login_id: "priya", password_hash: null, active: false,
          permissions: permissionsForRole("manager"), is_demo: true },
        { uid, employee_id: vikram, login_id: "vikram", password_hash: null, active: false,
          permissions: permissionsForRole("manager"), is_demo: true },
        { uid, employee_id: rahul, login_id: "rahul", password_hash: null, active: false,
          permissions: permissionsForRole("sales_rep"), is_demo: true },
        { uid, employee_id: sneha, login_id: "sneha", password_hash: null, active: false,
          permissions: permissionsForRole("sales_rep"), is_demo: true },
        { uid, employee_id: neha, login_id: "neha", password_hash: null, active: false,
          permissions: permissionsForRole("support_staff"), is_demo: true },
        { uid, employee_id: arjun, login_id: "arjun", password_hash: null, active: false,
          permissions: permissionsForRole("support_staff"), is_demo: true },
        { uid, employee_id: fatima, login_id: "fatima", password_hash: null, active: false,
          permissions: permissionsForRole("support_staff"), is_demo: true },
      ], false);

      // Last month's payroll, in mixed states — a draft to approve, an
      // approved one to pay, and one already paid. A payroll screen with
      // nothing on it demonstrates nothing.
      // 6 MONTHS of payslip history, so payroll shows a real track record, not
      // a single month. Older months are paid, the two most recent are approved
      // and draft — so there's something to pay and something to draft/check.
      const monthKey = (back: number) => {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      };
      // back=1 is last month (draft-able), 2 approved, 3..6 paid.
      const statusForAge = (back: number): string =>
        back === 1 ? "draft" : back === 2 ? "approved" : "paid";

      const historySlips: any[] = [];
      for (let back = 6; back >= 1; back--) {
        const month = monthKey(back);
        const status = statusForAge(back);
        for (const id of allStaff) {
          const base = salaryOf[id] || 18000;
          // A little variation so the history isn't flat: an occasional bonus
          // month for a couple of people.
          const hasBonus = (back % 3 === 0) && (id === priya || id === rahul);
          const additions = hasBonus ? 2500 : 0;
          historySlips.push({
            uid, employee_id: id, month, status,
            base_amount: base, additions, deductions: 0, net_amount: base + additions,
            paid_at: status === "paid" ? new Date().toISOString() : null,
            _bonus: additions,   // stripped before insert; used to build lines
          });
        }
      }
      // Insert payslips (without the helper field), then their lines.
      const slips = await insert(url, key, "payslips",
        historySlips.map(({ _bonus, ...s }) => s), true);
      if (Array.isArray(slips)) {
        const lines: any[] = [];
        for (let i = 0; i < slips.length; i++) {
          const sl = slips[i];
          const meta = historySlips[i];
          lines.push({ uid, payslip_id: sl.id, kind: "base", label: "Monthly salary", amount: sl.base_amount });
          if (meta && Number(meta._bonus) > 0) {
            lines.push({ uid, payslip_id: sl.id, kind: "bonus", label: "Performance bonus — strong month", amount: meta._bonus });
          }
        }
        if (lines.length) await insert(url, key, "payslip_lines", lines, false);
      }

      // BONUSES of the new kinds, so the feature is visible working:
      //   · an approved gift bonus that will ride the next payslip
      //   · a pending performance bonus a lead proposed, for admin to approve
      //   · a leave gift already granted (shows as earned-leave balance below)
      await insert(url, key, "bonus_requests", [
        { uid, employee_id: sneha, amount: 2000, kind: "gift", reason: "Diwali gift",
          status: "approved", requested_by: divya, decided_by: divya, decided_at: new Date().toISOString() },
        { uid, employee_id: rahul, amount: 3000, kind: "performance", reason: "Closed the Meera Joshi subscription",
          status: "pending", requested_by: priya },
      ], false);

      // V53: a pending expense claim, so the finance inbox and the expense
      // flow have something real to show the moment the demo loads.
      await insert(url, key, "expense_requests", [
        { uid, employee_id: rahul, amount: 850, category: "Travel",
          note: "Auto to client meeting", expense_date: daysAgo(2), status: "pending" },
      ], false);

      // The leave gift: 2 earned-leave days granted to Neha, through the same
      // grant path the bonus route uses. Recorded in leave_grants and reflected
      // in her balance.
      const thisYear = new Date().getFullYear();
      await insert(url, key, "leave_balances", [
        { uid, employee_id: neha, code: "earned", year: thisYear, accrued: 8, used: 2, carried_in: 0, granted: 2 },
        { uid, employee_id: priya, code: "earned", year: thisYear, accrued: 12, used: 3, carried_in: 2, granted: 0 },
        { uid, employee_id: rahul, code: "casual", year: thisYear, accrued: 9, used: 4, carried_in: 0, granted: 0 },
      ], false);
      await insert(url, key, "leave_grants", [
        { uid, employee_id: neha, code: "earned", year: thisYear, days: 2, reason: "Gift of leave — great support scores", granted_by: divya },
      ], false);

      // LEAVE history: a spread across people and time — approved in the past,
      // one pending for a lead to decide, one upcoming.
      await insert(url, key, "leave_requests", [
        { uid, employee_id: neha, code: "casual", from_date: daysAgo(40), to_date: daysAgo(40),
          days: 1, reason: "Family function", status: "approved" },
        { uid, employee_id: rahul, code: "earned", from_date: daysAgo(20), to_date: daysAgo(18),
          days: 3, reason: "Short trip", status: "approved" },
        { uid, employee_id: sneha, code: "sick", from_date: daysAgo(6), to_date: daysAgo(6),
          days: 1, reason: "Fever", status: "approved" },
        { uid, employee_id: arjun, code: "casual", from_date: daysAhead(5), to_date: daysAhead(5),
          days: 1, reason: "Personal work", status: "pending" },
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
