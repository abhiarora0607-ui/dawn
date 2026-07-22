// app/api/salary-change/route.ts
// Proposing and deciding salary changes.
//
// Finance and admin don't come here — they edit salary directly on the
// employee record, because they're the approving authority. This route is for
// a lead who holds salary_edit: they propose a number, and it waits for finance
// or an admin to approve before it touches the employee's pay.
//
// The employee whose salary it is never sees any of this. Salary changes
// aren't announced; the trail is the audit log.

import { NextResponse } from "next/server";
import { resolveApprover } from "@/lib/approvals";
import { salaryEditMode, canApproveSalaryChange } from "@/lib/salary-authority";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** The proposals this person may decide (finance/admin see all pending). */
export async function GET() {
  const appr = await resolveApprover();
  if (!appr) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { uid, url, key } = appr;

  const actor = { isAdmin: appr.isAdmin, permissions: appr.permissions };
  // Only finance/admin have a decision queue here.
  if (salaryEditMode(actor) !== "direct") return NextResponse.json({ requests: [] });

  try {
    const rows = await fetch(
      `${url}/rest/v1/salary_change_requests?uid=eq.${uid}&status=eq.pending&order=created_at.desc`,
      { headers: H(key), cache: "no-store" },
    ).then((r) => r.json()).catch(() => []);

    // Names for display.
    const emps = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name`,
      { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
    const nameById: Record<string, string> = {};
    for (const e of Array.isArray(emps) ? emps : []) nameById[e.id] = e.name;

    return NextResponse.json({
      requests: (Array.isArray(rows) ? rows : []).map((r: any) => ({
        ...r,
        employee_name: nameById[r.employee_id] || "Unknown",
        proposer_name: nameById[r.requested_by] || "A lead",
      })),
    });
  } catch { return NextResponse.json({ requests: [] }); }
}

export async function POST(req: Request) {
  const appr = await resolveApprover();
  if (!appr) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { uid, url, key } = appr;
  const actor = { isAdmin: appr.isAdmin, permissions: appr.permissions };

  try {
    const b = await req.json();

    // ---- propose (a lead) ----
    if (b.action === "propose") {
      if (salaryEditMode(actor) !== "propose") {
        return NextResponse.json({ error: "You can't propose a salary change." }, { status: 403 });
      }
      const employeeId = String(b.employeeId || "");
      const proposed = Number(b.proposedSalary);
      if (!employeeId) return NextResponse.json({ error: "Which employee?" }, { status: 400 });
      if (!(proposed >= 0)) return NextResponse.json({ error: "Enter a valid salary." }, { status: 400 });

      // A lead may only propose for someone on their team, never themselves.
      if (employeeId === appr.meId) {
        return NextResponse.json({ error: "You can't propose a change to your own salary." }, { status: 403 });
      }
      if (!appr.org.myTeam.includes(employeeId)) {
        return NextResponse.json({ error: "You can only propose changes for your own team." }, { status: 403 });
      }

      const current = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${employeeId}&select=monthly_salary&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]?.monthly_salary).catch(() => null);

      await fetch(`${url}/rest/v1/salary_change_requests`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          uid, employee_id: employeeId,
          current_salary: current ?? null,
          proposed_salary: proposed,
          reason: String(b.reason || "").slice(0, 300) || null,
          requested_by: appr.meId,
        }),
      });
      await audit({ uid, actor: appr.meId || "", actorType: "employee", action: "salary.propose", entity: "employees", entityId: employeeId, meta: { proposed } });
      return NextResponse.json({ ok: true, note: "Sent to finance for approval." });
    }

    // ---- approve / reject (finance or admin) ----
    if (b.action === "approve" || b.action === "reject") {
      const reqRow = await fetch(`${url}/rest/v1/salary_change_requests?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (!reqRow) return NextResponse.json({ error: "Request not found." }, { status: 404 });
      if (reqRow.status !== "pending") return NextResponse.json({ error: "Already decided." }, { status: 400 });

      if (!canApproveSalaryChange(actor, reqRow.requested_by, appr.meId)) {
        return NextResponse.json({
          error: appr.meId === reqRow.requested_by
            ? "You can't approve your own proposal."
            : "Only finance or an admin can approve a salary change.",
        }, { status: 403 });
      }

      const now = new Date().toISOString();
      const decidedBy = appr.meId || "owner";

      if (b.action === "approve") {
        // The change takes effect only now.
        await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${reqRow.employee_id}`, {
          method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ monthly_salary: reqRow.proposed_salary }),
        });
        await audit({ uid, actor: decidedBy, action: "salary.approve", entity: "employees", entityId: reqRow.employee_id, meta: { from: reqRow.current_salary, to: reqRow.proposed_salary } });
      } else {
        await audit({ uid, actor: decidedBy, action: "salary.reject", entity: "employees", entityId: reqRow.employee_id });
      }

      await fetch(`${url}/rest/v1/salary_change_requests?uid=eq.${uid}&id=eq.${b.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          status: b.action === "approve" ? "approved" : "rejected",
          decided_by: decidedBy, decided_at: now,
          decision_note: String(b.note || "").slice(0, 300) || null,
        }),
      });
      return NextResponse.json({ ok: true, note: b.action === "approve" ? "Salary updated." : "Proposal rejected." });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Couldn't process that." }, { status: 500 });
  }
}
