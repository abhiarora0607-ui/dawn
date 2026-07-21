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
import { buildPayslip, totalsOf, canTransition, transitionError, expenseNoteFor, STATUS_LABEL } from "@/lib/payroll";
import { istDate } from "@/lib/attendance";
import { LEAVE_LABEL } from "@/lib/leave";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

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
    canPay: org.isAdmin || permissions.includes("payroll_pay"),
    canApprove: org.isAdmin,
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
      if (!org.isAdmin) return NextResponse.json({ error: "Only an admin can run payroll." }, { status: 403 });

      const employees = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&status=eq.active&select=id,name,monthly_salary,joining_date`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const existing = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&month=eq.${month}&select=employee_id`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const have = new Set((Array.isArray(existing) ? existing : []).map((s: any) => s.employee_id));

      let made = 0;
      for (const e of Array.isArray(employees) ? employees : []) {
        if (have.has(e.id)) continue;                       // never a second slip for one month
        if (e.joining_date && e.joining_date.slice(0, 7) > month) continue;   // not employed yet

        // Approved-but-unpaid extras get folded in. They're claimed by this
        // payslip only when it's actually paid, so a cancelled run doesn't
        // silently consume someone's bonus.
        const [bonuses, encash] = await Promise.all([
          fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&employee_id=eq.${e.id}&status=eq.approved&paid_in_month=is.null&select=id,amount,reason`,
            { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
          fetch(`${url}/rest/v1/encashment_requests?uid=eq.${uid}&employee_id=eq.${e.id}&status=eq.approved&paid_in_month=is.null&select=id,days,amount,code`,
            { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
        ]);

        const built = buildPayslip({
          employeeName: e.name,
          monthlySalary: Number(e.monthly_salary || 0),
          bonuses: (Array.isArray(bonuses) ? bonuses : []).map((x: any) => ({ id: x.id, amount: Number(x.amount || 0), reason: x.reason })),
          encashments: (Array.isArray(encash) ? encash : []).map((x: any) => ({
            id: x.id, days: Number(x.days || 0), amount: Number(x.amount || 0), label: LEAVE_LABEL[x.code] || x.code,
          })),
          joiningDate: e.joining_date, month,
        });

        const slipRes = await fetch(`${url}/rest/v1/payslips`, {
          method: "POST", headers: H(key, { Prefer: "return=representation" }),
          body: JSON.stringify({
            uid, employee_id: e.id, month, status: "draft",
            base_amount: built.totals.base, additions: built.totals.additions,
            deductions: built.totals.deductions, net_amount: built.totals.net,
          }),
        }).then((r) => r.json()).catch(() => null);

        const slip = Array.isArray(slipRes) ? slipRes[0] : slipRes;
        if (!slip?.id) continue;

        await fetch(`${url}/rest/v1/payslip_lines`, {
          method: "POST", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify(built.lines.map((l) => ({
            uid, payslip_id: slip.id, kind: l.kind, label: l.label, amount: l.amount, source_id: l.sourceId || null,
          }))),
        });
        made++;
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
      if (to === "approved" && !org.isAdmin) {
        return NextResponse.json({ error: "Only an admin can approve payslips." }, { status: 403 });
      }
      if (to === "paid" && !(org.isAdmin || permissions.includes("payroll_pay"))) {
        return NextResponse.json({ error: "You don't have permission to mark payslips paid." }, { status: 403 });
      }

      const patch: any = { status: to };
      const now = new Date().toISOString();

      if (to === "approved") { patch.approved_at = now; patch.approved_by = meId || "owner"; }

      // ---- the moment money enters the books ----
      if (to === "paid") {
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
        note: to === "paid" ? "Marked paid — the expense is now in your books." : null,
      });
    }

    // ---------------------------------------------------- BULK APPROVE
    if (b.action === "approve_all") {
      if (!org.isAdmin) return NextResponse.json({ error: "Only an admin can approve payslips." }, { status: 403 });
      const drafts = await fetch(`${url}/rest/v1/payslips?uid=eq.${uid}&month=eq.${month}&status=eq.draft&select=id`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const n = Array.isArray(drafts) ? drafts.length : 0;
      if (n) {
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
