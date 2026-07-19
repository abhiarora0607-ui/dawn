// app/api/leave/route.ts
// The owner's side of leave: who's asked for what, everyone's balances, and
// deciding. Encashment decisions live here too — they're the same shape of
// action (someone asks, the owner says yes or no) and sharing the route keeps
// the approval logic in one place.
//
// Approving leave consumes balance and rewrites the affected attendance days,
// so a day off stops reading as an absence the moment it's approved.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getAttSettings, recomputeDay, getHolidays } from "@/lib/attendance-db";
import { getLeaveTypes, getBalances, adjustBalance } from "@/lib/leave-db";
import { LEAVE_LABEL, availableOf, dayRate, CURRENT_YEAR } from "@/lib/leave";
import { dateRange, istDate } from "@/lib/attendance";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function ctx() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return null;
  const area = await requireArea(url, key, uid, "crm");
  return { uid, url, key, blocked: area };
}

export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, url, key } = c;

  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") || "requests";
  const year = Number(sp.get("year")) || CURRENT_YEAR();

  const employees = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,role,monthly_salary,date_of_birth,joining_date,is_owner&order=name.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  const EMP = Array.isArray(employees) ? employees : [];
  const nameById: Record<string, string> = {};
  for (const e of EMP) nameById[e.id] = e.name;

  if (view === "encashments") {
    const rows = await fetch(`${url}/rest/v1/encashment_requests?uid=eq.${uid}&order=created_at.desc&limit=100`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
    return NextResponse.json({
      encashments: (Array.isArray(rows) ? rows : []).map((r: any) => ({ ...r, employee_name: nameById[r.employee_id] || "Unknown", label: LEAVE_LABEL[r.code] || r.code })),
    });
  }

  if (view === "balances") {
    const types = await getLeaveTypes(url, key, uid);
    const rows = await Promise.all(EMP.map(async (e: any) => ({
      id: e.id, name: e.name, role: e.role,
      balances: await getBalances(url, key, uid, e.id, year, types),
    })));
    return NextResponse.json({ year, types: types.filter((t) => t.enabled).map((t) => ({ code: t.code, label: LEAVE_LABEL[t.code] })), rows });
  }

  // requests
  const status = sp.get("status") || "pending";
  const filter = status === "all" ? "" : `&status=eq.${status}`;
  const rows = await fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}${filter}&order=created_at.desc&limit=100`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  const pending = await fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&status=eq.pending&select=id`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);

  return NextResponse.json({
    requests: (Array.isArray(rows) ? rows : []).map((r: any) => ({ ...r, employee_name: nameById[r.employee_id] || "Unknown", label: LEAVE_LABEL[r.code] || r.code })),
    pendingCount: Array.isArray(pending) ? pending.length : 0,
  });
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, url, key } = c;

  try {
    const b = await req.json();
    const year = CURRENT_YEAR();

    // ------------------------------------------------------ ENCASHMENT
    if (b.action === "encash_approve" || b.action === "encash_reject") {
      const rows = await fetch(`${url}/rest/v1/encashment_requests?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
      const er = Array.isArray(rows) ? rows[0] : null;
      if (!er) return NextResponse.json({ error: "Request not found." }, { status: 404 });
      if (er.status !== "pending") return NextResponse.json({ error: "Already decided." }, { status: 400 });

      if (b.action === "encash_reject") {
        await fetch(`${url}/rest/v1/encashment_requests?uid=eq.${uid}&id=eq.${er.id}`, {
          method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
          body: JSON.stringify({ status: "rejected", decided_at: new Date().toISOString(), decided_by: "owner" }),
        });
        return NextResponse.json({ ok: true });
      }

      // Price it from the salary at approval time, then reserve the days.
      const emp = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${er.employee_id}&select=monthly_salary,name&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]);
      const balances = await getBalances(url, key, uid, er.employee_id, year);
      const bal = balances.find((x) => x.code === er.code);
      if (!bal || bal.available < Number(er.days)) {
        return NextResponse.json({ error: `They only have ${bal?.available ?? 0} days of ${LEAVE_LABEL[er.code]} left.` }, { status: 400 });
      }
      const amount = Math.round(dayRate(emp?.monthly_salary || 0) * Number(er.days));

      await adjustBalance(url, key, uid, er.employee_id, er.code, year, { encashed: Number(er.days) });
      await fetch(`${url}/rest/v1/encashment_requests?uid=eq.${uid}&id=eq.${er.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "approved", amount, decided_at: new Date().toISOString(), decided_by: "owner" }),
      });
      await audit({ uid, action: "leave.encash.approve", entity: "encashment_requests", entityId: er.id, meta: { days: er.days, amount } });
      return NextResponse.json({ ok: true, amount, note: `₹${amount.toLocaleString()} will be added to their next salary expense.` });
    }

    // ----------------------------------------------------------- LEAVE
    if (!b.id || !["approve", "reject"].includes(b.action)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    const rows = await fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const lr = Array.isArray(rows) ? rows[0] : null;
    if (!lr) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (lr.status !== "pending") return NextResponse.json({ error: "That request has already been decided." }, { status: 400 });

    if (b.action === "reject") {
      await fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&id=eq.${lr.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "rejected", decided_at: new Date().toISOString(), decided_by: "owner", decision_note: String(b.note || "").slice(0, 300) || null }),
      });
      await audit({ uid, action: "leave.reject", entity: "leave_requests", entityId: lr.id, meta: { code: lr.code, from: lr.from_date } });
      return NextResponse.json({ ok: true });
    }

    // Approve: consume what they have, let the rest be unpaid.
    const types = await getLeaveTypes(url, key, uid);
    const type = types.find((t) => t.code === lr.code);
    const infinite = type?.accrual === "none";
    let consumed = 0, unpaid = 0;
    if (!infinite) {
      const balances = await getBalances(url, key, uid, lr.employee_id, year, types);
      const available = balances.find((x) => x.code === lr.code)?.available ?? 0;
      consumed = Math.min(available, Number(lr.days));
      unpaid = Math.max(0, Number(lr.days) - consumed);
      if (consumed > 0) await adjustBalance(url, key, uid, lr.employee_id, lr.code, year, { used: consumed });
    } else {
      unpaid = Number(lr.days);
    }

    await fetch(`${url}/rest/v1/leave_requests?uid=eq.${uid}&id=eq.${lr.id}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        status: "approved", decided_at: new Date().toISOString(), decided_by: "owner",
        is_unpaid_fallback: unpaid > 0 && !infinite,
        decision_note: String(b.note || "").slice(0, 300) || null,
      }),
    });

    // Rewrite those days so attendance stops calling them absences.
    try {
      const settings = await getAttSettings(url, key, uid);
      const emp = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&id=eq.${lr.employee_id}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).then((r) => r?.[0]);
      const holidays = await getHolidays(url, key, uid, lr.from_date, lr.to_date);
      const today = istDate();
      for (const d of dateRange(lr.from_date, lr.to_date)) {
        if (d > today) continue;                       // the future gets classified when it arrives
        await recomputeDay(url, key, uid, lr.employee_id, d, {
          emp, settings, holidayName: holidays[d] || null, leaveCode: lr.code,
        });
      }
    } catch { /* the approval itself must stand even if the rewrite hiccups */ }

    await audit({ uid, action: "leave.approve", entity: "leave_requests", entityId: lr.id, meta: { code: lr.code, days: lr.days, consumed, unpaid } });
    return NextResponse.json({
      ok: true, consumed, unpaid,
      note: unpaid > 0 && !infinite ? `${consumed} paid, ${unpaid} unpaid — their balance didn't cover the whole request.` : null,
    });
  } catch { return NextResponse.json({ error: "Couldn't process that." }, { status: 500 }); }
}
