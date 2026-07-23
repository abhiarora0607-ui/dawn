// app/api/team/expense/route.ts
// Expense claims, the worldwide flow: any employee SUBMITS (auto fare, client
// lunch, supplies — with an optional receipt link), finance or an admin
// APPROVES, and only on approval does the amount become an entry in the
// books. The rule this route exists to enforce is the payroll rule again:
// MONEY REACHES THE BOOKS ONLY WHEN SOMEONE WITH AUTHORITY SAYS SO.
//
//   · Submitting writes ONLY a pending claim — never an expense.
//   · Approving posts the books entry once (posted_expense_id remembers it,
//     so a retried approval can never double-post) and then marks the claim.
//   · Nobody approves their own claim, finance or not — maker-checker.
//   · Deciding happens in the Inbox (V52); this route is its action target.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, hasPermission } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CATEGORIES = ["Travel", "Food", "Supplies", "Client", "Other"];

/** Same GET/POST helper shape the sibling routes use. */
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const rows = await fetch(
      `${url}/rest/v1/expense_requests?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&order=created_at.desc&limit=50`,
      { headers: empHeaders(key), cache: "no-store" },
    ).then((r) => r.json()).catch(() => []);
    return NextResponse.json({ mine: Array.isArray(rows) ? rows : [], categories: CATEGORIES });
  } catch {
    return NextResponse.json({ error: "Couldn't load your claims." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const uid = ctx.uid;
  const meId = ctx.employeeId;

  try {
    const b = await req.json();

    // ---- submit: self-service, any employee. Writes a PENDING claim only. ----
    if (!b.action || b.action === "submit") {
      const amount = Number(b.amount);
      if (!(amount > 0)) return NextResponse.json({ error: "Enter the amount." }, { status: 400 });
      if (amount > 1000000) return NextResponse.json({ error: "That amount looks wrong — check it." }, { status: 400 });
      const category = CATEGORIES.includes(String(b.category)) ? String(b.category) : "Other";
      const expenseDate = String(b.expenseDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);

      await fetch(`${url}/rest/v1/expense_requests`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          uid, employee_id: meId, amount, category,
          note: String(b.note || "").slice(0, 300) || null,
          expense_date: expenseDate,
          receipt_url: String(b.receiptUrl || "").slice(0, 500) || null,
        }),
      });
      await audit({ uid, actor: meId || "", actorType: "employee", action: "expense.claim", entity: "expense_requests", entityId: meId || "", meta: { amount, category } });
      return NextResponse.json({ ok: true, note: "Claim sent to finance." });
    }

    // ---- approve / reject: finance or admin, never your own claim. ----
    if (b.action === "approve" || b.action === "reject") {
      const org = await loadOrg(url, key, uid, meId);
      const financeEyes = org.isAdmin
        || hasPermission(ctx, "expense_approve")
        || hasPermission(ctx, "payment_record");
      if (!financeEyes) {
        return NextResponse.json({ error: "Only finance or an admin can decide expense claims." }, { status: 403 });
      }

      const row = await fetch(`${url}/rest/v1/expense_requests?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (!row) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
      if (row.status !== "pending") return NextResponse.json({ error: "Already decided." }, { status: 400 });
      if (row.employee_id === meId) {
        return NextResponse.json({ error: "You can't decide your own claim — it goes to another approver." }, { status: 403 });
      }

      const now = new Date().toISOString();
      const decidedBy = meId || "owner";

      if (b.action === "approve") {
        // The one and only place a claim touches the books — and only once.
        if (row.posted_expense_id) return NextResponse.json({ error: "Already posted." }, { status: 400 });
        const nameRow = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${row.employee_id}&select=name&limit=1`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
        const posted = await fetch(`${url}/rest/v1/expenses`, {
          method: "POST", headers: H(key, { Prefer: "return=representation" }),
          body: JSON.stringify({
            uid, date: row.expense_date, category: row.category, amount: row.amount,
            note: `${nameRow?.name || "Employee"} — ${row.note || row.category}`,
            source: "expense_claim", source_id: row.id,
          }),
        }).then((r) => r.json()).catch(() => null);
        const postedId = Array.isArray(posted) ? posted?.[0]?.id : posted?.id;

        await fetch(`${url}/rest/v1/expense_requests?uid=eq.${uid}&id=eq.${b.id}`, {
          method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ status: "approved", decided_by: decidedBy, decided_at: now, decision_note: String(b.note || "").slice(0, 300) || null, posted_expense_id: postedId || null }),
        });
        await audit({ uid, actor: decidedBy, action: "expense.approve", entity: "expense_requests", entityId: b.id, meta: { amount: row.amount } });
        return NextResponse.json({ ok: true, note: "Approved — it's in the books." });
      }

      await fetch(`${url}/rest/v1/expense_requests?uid=eq.${uid}&id=eq.${b.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "rejected", decided_by: decidedBy, decided_at: now, decision_note: String(b.note || "").slice(0, 300) || null }),
      });
      await audit({ uid, actor: decidedBy, action: "expense.reject", entity: "expense_requests", entityId: b.id });
      return NextResponse.json({ ok: true, note: "Claim rejected." });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Couldn't process that." }, { status: 500 });
  }
}
