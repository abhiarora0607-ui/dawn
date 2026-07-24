// app/api/bonus/route.ts
import { isBonusKind } from "@/lib/bonus";
// Bonuses: a manager proposes, an admin approves, a payslip pays.
//
// The split matters. A lead who could award money directly is a lead who could
// pay their friends, so proposing and approving are deliberately different
// acts by different people. And an approved bonus still isn't money — it waits
// for a payslip, and that payslip has to be marked paid before it reaches the
// books.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getEmployee } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
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

export async function GET() {
  const c = await resolve();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if ("blocked" in c && c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, meId, url, key, permissions } = c as any;

  const org = await loadOrg(url, key, uid, meId);

  const rows = await fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&select=*&order=created_at.desc&limit=100`,
    { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  const nameById: Record<string, string> = {};
  for (const e of org.employees) nameById[e.id] = e.name;

  // A manager sees what they proposed and what's pending for their people;
  // an admin sees everything.
  const visible = (Array.isArray(rows) ? rows : []).filter((b: any) =>
    org.isAdmin || b.requested_by === meId || org.canSee(b.employee_id));

  return NextResponse.json({
    canApprove: org.isAdmin,
    canPropose: org.isAdmin || permissions.includes("bonus_request") || org.myTeam.length > 0,
    // Only people this caller is actually responsible for.
    team: org.employees
      .filter((e) => org.isAdmin ? true : org.myTeam.includes(e.id))
      .filter((e) => e.status !== "inactive")
      .map((e) => ({ id: e.id, name: e.name })),
    requests: visible.map((b: any) => ({
      ...b,
      employee_name: nameById[b.employee_id] || "Unknown",
      requested_by_name: b.requested_by ? (nameById[b.requested_by] || "A manager") : "Admin",
    })),
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

    // ---- propose ----
    if (!b.action || b.action === "create") {
      const employeeId = String(b.employeeId || "");
      const kind = String(b.kind || "cash");
      if (!isBonusKind(kind)) return NextResponse.json({ error: "Unknown bonus type." }, { status: 400 });

      // You may only give to your own people, never yourself — for every kind.
      if (!org.isAdmin && !org.myTeam.includes(employeeId)) {
        return NextResponse.json({ error: "You can only give a bonus to someone on your team." }, { status: 403 });
      }
      if (!org.isAdmin && !permissions.includes("bonus_request") && org.myTeam.length === 0) {
        return NextResponse.json({ error: "You don't have permission to give bonuses." }, { status: 403 });
      }
      if (employeeId === meId) {
        return NextResponse.json({ error: "You can't give a bonus to yourself." }, { status: 403 });
      }

      // ---- leave gift: not cash. It grants earned leave and never touches a
      // payslip. Only an admin can give leave, matching the grant rule. ----
      if (kind === "leave_gift") {
        if (!org.isAdmin) {
          return NextResponse.json({ error: "Only an admin can gift leave." }, { status: 403 });
        }
        const days = Number(b.days || 0);
        if (!(days > 0)) return NextResponse.json({ error: "How many days of leave?" }, { status: 400 });
        if (days > 365) return NextResponse.json({ error: "That's more than a year." }, { status: 400 });

        const year = new Date().getFullYear();
        const reason = String(b.reason || "").slice(0, 300) || "Gift of leave";
        // Reuse the exact leave-grant path: bump the earned balance and log it.
        const existing = await fetch(`${url}/rest/v1/leave_balances?uid=eq.${uid}&employee_id=eq.${employeeId}&code=eq.earned&year=eq.${year}&select=id,granted&limit=1`,
          { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
        if (existing) {
          await fetch(`${url}/rest/v1/leave_balances?uid=eq.${uid}&id=eq.${existing.id}`, {
            method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify({ granted: Number(existing.granted || 0) + days }),
          });
        } else {
          await fetch(`${url}/rest/v1/leave_balances`, {
            method: "POST", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify({ uid, employee_id: employeeId, code: "earned", year, accrued: 0, used: 0, carried_in: 0, granted: days }),
          });
        }
        await fetch(`${url}/rest/v1/leave_grants`, {
          method: "POST", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ uid, employee_id: employeeId, code: "earned", year, days, reason, granted_by: meId || "owner" }),
        }).catch(() => {});
        await audit({ uid, action: "bonus.leave_gift", entity: "leave_balances", entityId: employeeId, meta: { days } });
        return NextResponse.json({ ok: true, note: `${days} ${days === 1 ? "day" : "days"} of leave added.` });
      }

      // ---- cash-bearing kinds: the original path, now tagged with kind. ----
      const amount = Number(b.amount || 0);
      if (!employeeId || amount <= 0) return NextResponse.json({ error: "Who's it for, and how much?" }, { status: 400 });

      await fetch(`${url}/rest/v1/bonus_requests`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          uid, employee_id: employeeId, amount, kind,
          reason: String(b.reason || "").slice(0, 300) || null,
          requested_by: meId, status: org.isAdmin ? "approved" : "pending",
          decided_at: org.isAdmin ? new Date().toISOString() : null,
          decided_by: org.isAdmin ? (meId || "owner") : null,
        }),
      });
      await audit({ uid, action: "bonus.create", entity: "bonus_requests", entityId: employeeId, meta: { amount, kind, auto: org.isAdmin } });
      return NextResponse.json({
        ok: true,
        note: org.isAdmin
          ? "Added — it'll appear on their next payslip."
          : "Sent to an admin for approval.",
      });
    }

    // ---- decide ----
    if (b.action === "approve" || b.action === "reject") {
      if (!org.isAdmin) return NextResponse.json({ error: "Only an admin can approve a bonus." }, { status: 403 });

      const row = await fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`,
        { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]).catch(() => null);
      if (!row) return NextResponse.json({ error: "Request not found." }, { status: 404 });
      if (row.status !== "pending") return NextResponse.json({ error: "That's already been decided." }, { status: 400 });

      await fetch(`${url}/rest/v1/bonus_requests?uid=eq.${uid}&id=eq.${b.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          status: b.action === "approve" ? "approved" : "rejected",
          decided_at: new Date().toISOString(), decided_by: meId || "owner",
          decision_note: String(b.note || "").slice(0, 300) || null,
        }),
      });
      await audit({ uid, action: `bonus.${b.action}`, entity: "bonus_requests", entityId: b.id, meta: { amount: row.amount } });
      return NextResponse.json({
        ok: true,
        note: b.action === "approve" ? "Approved — it'll ride their next payslip." : null,
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch { return NextResponse.json({ error: "Couldn't do that." }, { status: 500 }); }
}
