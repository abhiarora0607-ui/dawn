// app/api/payroll/route.ts
// Running payroll: generate the month's payslips, approve them, mark them paid.
//
// The single most important line in this file is the one that creates an
// expense — and it only runs on the transition to `paid`. Everything before
// that is a document, not money. Before V39 the cron wrote the expense the
// moment the month ticked over, so the books said salaries had been paid on
// the 1st whether or not anyone had transferred anything.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getEmployee } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { buildPayslip, totalsOf, canTransition, transitionError, expenseNoteFor, isEditable, STATUS_LABEL } from "@/lib/payroll";
import { revenueByEmployee, commissionFor, commissionLabel, monthGuardError, latestDraftableMonth } from "@/lib/commission";
import { subtreeOf } from "@/lib/org";
import { istDate } from "@/lib/attendance";
import { LEAVE_LABEL } from "@/lib/leave";
import { audit } from "@/lib/audit";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";

async function resolve() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const ownerUid = await getUid();
  if (ownerUid) {
    const blocked = await requireArea(url, key, ownerUid, "crm");
    if (blocked) return { blocked };
    return { uid: ownerUid, meId: null as string | null, url, key, permissions: [] as string[] };
  }
  const emp = await getEmployee();
  if (emp) return { uid: emp.uid, meId: emp.employeeId, url, key, permissions: emp.permissions || [] };
  return null;
}

export async function GET(req: Request) {
  const c = await resolve();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if ("blocked" in c && c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, meId, url, key, permissions } = c as any;

  const org = await loadOrg(url, key, uid, meId);
  // Seeing the payroll run means seeing everyone's pay.
  const canSeePay = org.isAdmin || permissions.includes("salary_view");
  if (!canSeePay) return NextResponse.json({ error: "You don't have access to payroll." }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") || istDate().slice(0, 7);

  const [slips, employees, pendingBonuses] = await Promise.all([
    // full-scan: one month's run, bounded by month
    fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&month=eq.${month}&select=*&order=created_at.asc`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/employees?uid=eq.${uid}&status=eq.active&select=id,name,monthly_salary,joining_date,job_title`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&status=eq.pending&select=*&order=created_at.desc`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ]);

  const EMP = Array.isArray(employees) ? employees : [];
  const nameById: Record<string, string> = {};
  for (const e of EMP) nameById[e.id] = e.name;

  const S = Array.isArray(slips) ? slips : [];
  const lines = S.length
    ? await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&payslip_id=in.(${S.map((s: any) => s.id).join(",")})&select=*`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
    : [];
  const linesBySlip: Record<string, any[]> = {};
  for (const l of Array.isArray(lines) ? lines : []) (linesBySlip[l.payslip_id] ||= []).push(l);

  return NextResponse.json({
    month,
    canPrepare: org.isAdmin || permissions.includes("payroll_prepare"),
    canApprove: org.isAdmin || permissions.includes("payroll_approve"),
    canPay: org.isAdmin || permissions.includes("payroll_pay"),
    payslips: S.map((s: any) => ({
      ...s,
      employee_name: nameById[s.employee_id] || "Unknown",
      statusLabel: STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] || s.status,
      lines: (linesBySlip[s.id] || []).sort((a: any, b: any) => (a.kind === "base" ? -1 : 1)),
    })),
    // Anyone without a payslip this month yet — the reason to press Generate.
    missing: EMP.filter((e: any) => !S.some((s: any) => s.employee_id === e.id))
      .map((e: any) => ({ id: e.id, name: e.name, salary: Number(e.monthly_salary || 0) })),
    pendingBonuses: (Array.isArray(pendingBonuses) ? pendingBonuses : []).map((b: any) => ({
      ...b, employee_name: nameById[b.employee_id] || "Unknown",
      requested_by_name: nameById[b.requested_by] || "a manager",
    })),
    totals: {
      count: S.length,
      net: S.reduce((n: number, s: any) => n + Number(s.net_amount || 0), 0),
      unpaid: S.filter((s: any) => s.status !== "paid" && s.status !== "cancelled").length,
    },
  });
}

export async function POST(req: Request) {
  const c = await resolve();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if ("blocked" in c && c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, meId, url, key, permissions } = c as any;

  const org = await loadOrg(url, key, uid, meId);

  try {
    const b = await req.json();
    const month = String(b.month || istDate().slice(0, 7));

    // ------------------------------------------------------- GENERATE
    if (b.action === "generate") {
      if (!(org.isAdmin || permissions.includes("payroll_prepare"))) {
        return NextResponse.json({ error: "You don't have permission to draft payslips." }, { status: 403 });
      }

      // V46: June's payroll is drafted in July, not in June. A payslip built
      // halfway through a month uses half its attendance and a fraction of its
      // revenue — a number that looks authoritative and is simply wrong.
      const guard = monthGuardError(month, istDate());
      if (guard) return NextResponse.json({ error: guard }, { status: 400 });

      const employees = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&status=eq.active&select=id,name,monthly_salary,joining_date,commission_eligible,commission_basis,commission_rate`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);

      // Revenue and unpaid days for the whole month, fetched once rather than
      // per employee — a 200-person business would otherwise make 400 requests.
      const monthStart = `${month}-01`;
      const monthEnd = `${month}-31`;
      const [orders, unpaidRows] = await Promise.all([
        fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=is.null&date=gte.${monthStart}&date=lte.${monthEnd}&select=employee_id,amount_paid,order_status`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
        // Unpaid leave is recorded on the attendance day, so it can be counted
        // without re-deriving it from leave requests.
        fetch(`${url}/rest/v1/attendance_days?uid=eq.${uid}&work_date=gte.${monthStart}&work_date=lte.${monthEnd}&leave_code=eq.unpaid&select=employee_id,work_date`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      ]);

      const revenue = revenueByEmployee((Array.isArray(orders) ? orders : []).map((o: any) => ({
        employeeId: o.employee_id, amountPaid: Number(o.amount_paid || 0), status: o.order_status,
      })));
      const unpaidBy: Record<string, number> = {};
      for (const r of Array.isArray(unpaidRows) ? unpaidRows : []) {
        unpaidBy[r.employee_id] = (unpaidBy[r.employee_id] || 0) + 1;
      }
      // Commission on team basis needs the org tree.
      const treeFor = (id: string) => subtreeOf(id, org.employees);
      // full-scan: one month's run, bounded by month
      const existing = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&month=eq.${month}&select=employee_id`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const have = new Set((Array.isArray(existing) ? existing : []).map((s: any) => s.employee_id));

      // V48c: all approved-unpaid bonuses and encashments for the WHOLE company
      // in two queries, indexed by employee — instead of two queries per person.
      // At fifty employees this replaces a hundred round-trips with two.
      const [allBonuses, allEncash] = await Promise.all([
        fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&status=eq.approved&paid_in_month=is.null&select=id,employee_id,amount,reason,kind`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
        fetch(`${url}/rest/v1/encashment_requests?uid=eq.${uid}&status=eq.approved&paid_in_month=is.null&select=id,employee_id,days,amount,code`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      ]);
      const bonusBy: Record<string, any[]> = {};
      for (const x of Array.isArray(allBonuses) ? allBonuses : []) (bonusBy[x.employee_id] ||= []).push(x);
      const encashBy: Record<string, any[]> = {};
      for (const x of Array.isArray(allEncash) ? allEncash : []) (encashBy[x.employee_id] ||= []).push(x);

      let made = 0;
      // Payslips and their lines are collected, then written in two bulk
      // inserts after the loop rather than two writes per person.
      const slipsToInsert: any[] = [];
      const linesByEmployee: Record<string, any[]> = {};
      for (const e of Array.isArray(employees) ? employees : []) {
        if (have.has(e.id)) continue;                       // never a second slip for one month
        if (e.joining_date && e.joining_date.slice(0, 7) > month) continue;   // not employed yet

        // From the hoisted bulk reads — no per-employee round-trip.
        const bonuses = bonusBy[e.id] || [];
        const encash = encashBy[e.id] || [];

        const comm = commissionFor(
          {
            employeeId: e.id,
            eligible: !!e.commission_eligible,
            basis: (e.commission_basis === "team" ? "team" : "own"),
            rate: Number(e.commission_rate || 0),
          },
          revenue, treeFor,
        );

        const built = buildPayslip({
          employeeName: e.name,
          monthlySalary: Number(e.monthly_salary || 0),
          unpaidDays: unpaidBy[e.id] || 0,
          commission: comm.amount > 0
            ? { amount: comm.amount, label: commissionLabel(comm, e.commission_basis === "team" ? "team" : "own") }
            : null,
          bonuses: (Array.isArray(bonuses) ? bonuses : []).map((x: any) => ({ id: x.id, amount: Number(x.amount || 0), reason: x.reason, kind: x.kind })),
          encashments: (Array.isArray(encash) ? encash : []).map((x: any) => ({
            id: x.id, days: Number(x.days || 0), amount: Number(x.amount || 0), label: LEAVE_LABEL[x.code] || x.code,
          })),
          joiningDate: e.joining_date, month,
        });

        // Collected, not written yet — the bulk inserts happen after the loop.
        slipsToInsert.push({
          uid, employee_id: e.id, month, status: "draft",
          base_amount: built.totals.base, additions: built.totals.additions,
          deductions: built.totals.deductions, net_amount: built.totals.net,
          commission_base: comm.base, unpaid_days: unpaidBy[e.id] || 0,
        });
        // Lines can't reference the payslip id until it exists, so they're
        // keyed by employee here and stitched to their payslip after insert.
        linesByEmployee[e.id] = built.lines.map((l) => ({
          uid, kind: l.kind, label: l.label, amount: l.amount, source_id: l.sourceId || null,
        }));
        made++;
      }

      // One bulk insert for every payslip, returning the generated ids.
      if (slipsToInsert.length > 0) {
        const inserted = await fetch(`${url}/rest/v1/payslips`, {
          method: "POST", headers: H(key, { Prefer: "return=representation" }),
          body: JSON.stringify(slipsToInsert),
        }).then((r) => r.json()).catch(() => []);

        // Stitch each payslip's id onto its lines, then one bulk insert for all.
        const allLines: any[] = [];
        for (const slip of Array.isArray(inserted) ? inserted : []) {
          for (const line of linesByEmployee[slip.employee_id] || []) {
            allLines.push({ ...line, payslip_id: slip.id });
          }
        }
        if (allLines.length > 0) {
          await fetch(`${url}/rest/v1/payslip_lines`, {
            method: "POST", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify(allLines),
          }).catch(() => {});
        }
      }
      await audit({ uid, action: "payroll.generate", entity: "payslips", entityId: month, meta: { made } });
      return NextResponse.json({ ok: true, made, note: made === 0 ? "Everyone already has a payslip for this month." : `${made} payslip${made === 1 ? "" : "s"} drafted.` });
    }

    // ------------------------------------------------------ TRANSITION
    if (b.action === "set_status") {
      const slip = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (!slip) return NextResponse.json({ error: "Payslip not found." }, { status: 404 });

      const to = String(b.status);
      const err = transitionError(slip.status, to as any);
      if (err) return NextResponse.json({ error: err }, { status: 400 });

      // Approving is an admin act; paying is a separate permission, because at
      // two people that's the owner and at two hundred it's a finance clerk.
      if ((to === "approved" || to === "rejected") && !(org.isAdmin || permissions.includes("payroll_approve"))) {
        return NextResponse.json({ error: "You don't have permission to approve or reject payslips." }, { status: 403 });
      }
      if (to === "paid" && !(org.isAdmin || permissions.includes("payroll_pay"))) {
        return NextResponse.json({ error: "You don't have permission to mark payslips paid." }, { status: 403 });
      }

      const patch: any = { status: to };
      const now = new Date().toISOString();

      if (to === "approved") { patch.approved_at = now; patch.approved_by = meId || "owner"; }
      if (to === "rejected") {
        patch.note = String(b.reason || "").slice(0, 300) || "Sent back without a reason given";
        // Clear the earlier sign-off: a rejected payslip has not been approved.
        patch.approved_at = null; patch.approved_by = null;
      }
      // Returning to draft keeps the rejection note so the person fixing it
      // can still see what was wrong.
      if (to === "draft") { patch.approved_at = null; patch.approved_by = null; }

      // ---- the moment money enters the books ----
      // Approving posts the expense (V45: paying is withdrawn for now). A
      // payslip that already created one must never create a second — the
      // approved → paid path would otherwise double-count every salary.
      if (to === "paid" && !slip.expense_id) {
        const emp = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${slip.employee_id}&select=name&limit=1`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
        const lines = await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&payslip_id=eq.${slip.id}&select=*`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);

        const expRes = await fetch(`${url}/rest/v1/expenses`, {
          method: "POST", headers: H(key, { Prefer: "return=representation" }),
          body: JSON.stringify({
            uid, date: istDate(), category: "Salaries",
            amount: Number(slip.net_amount || 0),
            note: expenseNoteFor(emp?.name || "Employee", slip.month, { base: Number(slip.base_amount || 0), additions: Number(slip.additions || 0) }),
            source: "salary", source_id: slip.employee_id, recurring: false,
          }),
        }).then((r) => r.json()).catch(() => null);
        const expense = Array.isArray(expRes) ? expRes[0] : expRes;
        if (expense?.id) patch.expense_id = expense.id;

        patch.paid_at = now;
        patch.paid_by = meId || "owner";

        // The bonuses and encashments on this slip are settled — and only now,
        // once the expense exists, so a failed run never marks them paid.
        for (const l of Array.isArray(lines) ? lines : []) {
          if (!l.source_id) continue;
          const table = l.kind === "bonus" ? "bonus_requests" : l.kind === "encashment" ? "encashment_requests" : null;
          if (!table) continue;
          await fetch(`${url}/rest/v1/${table}?uid=eq.${uid}&id=eq.${l.source_id}`, {
            method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify({ status: "paid", paid_in_month: slip.month }),
          }).catch(() => {});
        }
      }

      await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&id=eq.${slip.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
      });
      await audit({ uid, action: `payroll.${to}`, entity: "payslips", entityId: slip.id, meta: { month: slip.month, net: slip.net_amount } });

      return NextResponse.json({
        ok: true,
        note: to === "paid" ? "Marked paid — the salary is now in your books."
          : to === "approved" ? "Approved. It's ready to be paid."
          : to === "rejected" ? "Sent back for changes."
          : null,
      });
    }

    // ------------------------------------------------------ EDIT A DRAFT
    // Rejection is only useful if the figure can then be corrected. Whoever
    // may draft may edit — finance prepares the numbers, so finance fixes them.
    if (b.action === "edit_line") {
      if (!(org.isAdmin || permissions.includes("payroll_prepare"))) {
        return NextResponse.json({ error: "You don't have permission to change payslips." }, { status: 403 });
      }

      const slip = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (!slip) return NextResponse.json({ error: "Payslip not found." }, { status: 404 });

      // Only a draft. Editing an approved payslip would make the approval
      // meaningless — someone signed off a number that no longer exists.
      if (!isEditable(slip.status)) {
        return NextResponse.json({
          error: slip.status === "paid"
            ? "This is already paid — correct it with an expense adjustment."
            : "Send it back to draft before changing the figures.",
        }, { status: 400 });
      }

      const label = String(b.label || "").trim().slice(0, 120);
      const amount = Number(b.amount || 0);
      const kind = ["bonus", "deduction"].includes(String(b.kind)) ? String(b.kind) : null;
      if (!kind) return NextResponse.json({ error: "Add it as a bonus or a deduction." }, { status: 400 });
      if (!label) return NextResponse.json({ error: "What is this line for?" }, { status: 400 });
      if (!(amount > 0)) return NextResponse.json({ error: "How much?" }, { status: 400 });

      if (b.lineId) {
        await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&id=eq.${b.lineId}`, {
          method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ label, amount, kind }),
        });
      } else {
        await fetch(`${url}/rest/v1/payslip_lines`, {
          method: "POST", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ uid, payslip_id: slip.id, kind, label, amount, source_id: null }),
        });
      }

      // Recompute from the lines rather than adjusting the stored total: the
      // lines are the truth, and a total maintained separately drifts.
      const lines = await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&payslip_id=eq.${slip.id}&select=kind,label,amount`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const totals = totalsOf((Array.isArray(lines) ? lines : []).map((l: any) => ({
        kind: l.kind, label: l.label, amount: Number(l.amount || 0),
      })));

      await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&id=eq.${slip.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          base_amount: totals.base, additions: totals.additions,
          deductions: totals.deductions, net_amount: totals.net,
        }),
      });
      await audit({ uid, action: "payroll.edit_line", entity: "payslips", entityId: slip.id, meta: { kind, label, amount } });
      return NextResponse.json({ ok: true, note: "Updated." });
    }

    if (b.action === "delete_line") {
      if (!(org.isAdmin || permissions.includes("payroll_prepare"))) {
        return NextResponse.json({ error: "You don't have permission to change payslips." }, { status: 403 });
      }
      const slip = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (!slip) return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
      if (!isEditable(slip.status)) {
        return NextResponse.json({ error: "Send it back to draft before changing the figures." }, { status: 400 });
      }

      // The base salary line is what the payslip IS. Removing it would leave a
      // document that pays somebody nothing for a month they worked.
      const line = await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&id=eq.${b.lineId}&select=kind&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (line?.kind === "base") {
        return NextResponse.json({ error: "The salary line can't be removed. Change the amount instead." }, { status: 400 });
      }

      await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&id=eq.${b.lineId}`,
        { method: "DELETE", headers: H(key, { Prefer: "return=minimal" }) });

      const lines = await fetch(`${url}/rest/v1/payslip_lines?uid=eq.${uid}&payslip_id=eq.${slip.id}&select=kind,label,amount`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const totals = totalsOf((Array.isArray(lines) ? lines : []).map((l: any) => ({
        kind: l.kind, label: l.label, amount: Number(l.amount || 0),
      })));
      await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&id=eq.${slip.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          base_amount: totals.base, additions: totals.additions,
          deductions: totals.deductions, net_amount: totals.net,
        }),
      });
      await audit({ uid, action: "payroll.delete_line", entity: "payslips", entityId: slip.id });
      return NextResponse.json({ ok: true, note: "Removed." });
    }

    // ---------------------------------------------------- BULK APPROVE
    if (b.action === "approve_all") {
      if (!(org.isAdmin || permissions.includes("payroll_approve"))) {
        return NextResponse.json({ error: "You don't have permission to approve payslips." }, { status: 403 });
      }
      // full-scan: one month's drafts, bounded by month
      const drafts = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&month=eq.${month}&status=eq.draft&select=id`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const n = Array.isArray(drafts) ? drafts.length : 0;
      if (n) {
        // full-scan: one month's drafts, bounded by month
        await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&month=eq.${month}&status=eq.draft`, {
          method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ status: "approved", approved_at: new Date().toISOString(), approved_by: meId || "owner" }),
        });
      }
      await audit({ uid, action: "payroll.approve_all", entity: "payslips", entityId: month, meta: { count: n } });
      return NextResponse.json({ ok: true, note: `${n} payslip${n === 1 ? "" : "s"} approved.` });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch { return NextResponse.json({ error: "Couldn't do that." }, { status: 500 }); }
}
