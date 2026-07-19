// app/api/attendance/requests/route.ts
// The owner's inbox for "I forgot to punch" requests.
//
// Approving replaces that day's punches with the corrected ones and recomputes
// the day. The request row keeps the proposed times and the employee's reason
// permanently, and the change is written to the audit trail — so a corrected
// day is always traceable back to who asked, why, and who approved it.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { recomputeDay, getAttSettings } from "@/lib/attendance-db";
import { IST_OFFSET_MIN, hhmmToMinutes } from "@/lib/attendance";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** "2026-07-16" + "09:15" IST → the matching UTC instant. */
function istToUtc(date: string, hhmm: string): string {
  const mins = hhmmToMinutes(hhmm) ?? 0;
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + (mins - IST_OFFSET_MIN) * 60000).toISOString();
}

export async function GET(req: Request) {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const area = await requireArea(url, key, uid, "crm");
  if (area) return NextResponse.json(area, { status: 403 });

  const status = new URL(req.url).searchParams.get("status") || "pending";
  const filter = status === "all" ? "" : `&status=eq.${status}`;
  const [rows, employees] = await Promise.all([
    fetch(`${url}/rest/v1/regularization_requests?uid=eq.${uid}${filter}&order=created_at.desc&limit=100`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ]);
  const nameById: Record<string, string> = {};
  for (const e of Array.isArray(employees) ? employees : []) nameById[e.id] = e.name;

  return NextResponse.json({
    requests: (Array.isArray(rows) ? rows : []).map((r: any) => ({ ...r, employee_name: nameById[r.employee_id] || "Unknown" })),
    pendingCount: (Array.isArray(rows) ? rows : []).filter((r: any) => r.status === "pending").length,
  });
}

export async function POST(req: Request) {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const area = await requireArea(url, key, uid, "crm");
  if (area) return NextResponse.json(area, { status: 403 });

  try {
    const b = await req.json();
    if (!b.id || !["approve", "reject"].includes(b.action)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    const rows = await fetch(`${url}/rest/v1/regularization_requests?uid=eq.${uid}&id=eq.${b.id}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const rr = Array.isArray(rows) ? rows[0] : null;
    if (!rr) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (rr.status !== "pending") return NextResponse.json({ error: "That request has already been decided." }, { status: 400 });

    if (b.action === "reject") {
      await fetch(`${url}/rest/v1/regularization_requests?uid=eq.${uid}&id=eq.${rr.id}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ status: "rejected", decided_at: new Date().toISOString(), decided_by: "owner", decision_note: String(b.note || "").slice(0, 300) || null }),
      });
      await audit({ uid, action: "attendance.regularize.reject", entity: "regularization_requests", entityId: rr.id, meta: { date: rr.work_date } });
      return NextResponse.json({ ok: true });
    }

    // ---- approve: replace that day's punches with the corrected ones ----
    const proposed: { in: string; out: string }[] = Array.isArray(rr.proposed_logs) ? rr.proposed_logs : [];
    if (proposed.length === 0) return NextResponse.json({ error: "That request has no times on it." }, { status: 400 });

    await fetch(`${url}/rest/v1/attendance_logs?uid=eq.${uid}&employee_id=eq.${rr.employee_id}&work_date=eq.${rr.work_date}`, {
      method: "DELETE", headers: H(key),
    });
    await fetch(`${url}/rest/v1/attendance_logs`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify(proposed.map((p) => ({
        uid, employee_id: rr.employee_id, work_date: rr.work_date,
        punch_in: istToUtc(rr.work_date, p.in),
        punch_out: istToUtc(rr.work_date, p.out),
        within_fence: null,
        source: "regularized",
        note: `Regularized: ${String(rr.reason).slice(0, 120)}`,
      }))),
    });

    await fetch(`${url}/rest/v1/regularization_requests?uid=eq.${uid}&id=eq.${rr.id}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ status: "approved", decided_at: new Date().toISOString(), decided_by: "owner", decision_note: String(b.note || "").slice(0, 300) || null }),
    });

    const settings = await getAttSettings(url, key, uid);
    const day = await recomputeDay(url, key, uid, rr.employee_id, rr.work_date, { settings });
    await audit({ uid, action: "attendance.regularize.approve", entity: "regularization_requests", entityId: rr.id, meta: { date: rr.work_date, logs: proposed } });

    return NextResponse.json({ ok: true, day });
  } catch {
    return NextResponse.json({ error: "Couldn't process that." }, { status: 500 });
  }
}
