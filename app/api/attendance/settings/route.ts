// app/api/attendance/settings/route.ts
// Every rule the owner controls: where the shop is, how big the fence is,
// how long a day is, what counts as half, weekly offs, holidays, and the
// regularization limits. Plus one-off remote grants.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getAttSettings } from "@/lib/attendance-db";
import { audit } from "@/lib/audit";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
const num = (v: any, lo: number, hi: number, dflt: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

async function ctx() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return null;
  const area = await requireArea(url, key, uid, "crm");
  if (area) return { blocked: area, uid, url, key };
  return { uid, url, key, blocked: null as any };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, url, key } = c;

  const [settings, holidays, grants] = await Promise.all([
    getAttSettings(url, key, uid),
    fetch(`${url}/rest/v1/holidays?uid=eq.${uid}&select=*&order=holiday_date.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    fetch(`${url}/rest/v1/remote_grants?uid=eq.${uid}&select=*&order=from_date.desc&limit=50`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
  ]);
  return NextResponse.json({
    settings,
    holidays: Array.isArray(holidays) ? holidays : [],
    remoteGrants: Array.isArray(grants) ? grants : [],
  });
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, url, key } = c;

  try {
    const b = await req.json();

    // ---- holidays ----
    if (b.action === "add_holiday") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.date || ""))) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
      await fetch(`${url}/rest/v1/holidays`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ uid, holiday_date: b.date, name: String(b.name || "Holiday").slice(0, 80) }),
      });
      await audit({ uid, action: "attendance.holiday.add", entity: "holidays", entityId: b.date, meta: { name: b.name } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "remove_holiday") {
      await fetch(`${url}/rest/v1/holidays?uid=eq.${uid}&id=eq.${b.id}`, { method: "DELETE", headers: H(key) });
      return NextResponse.json({ ok: true });
    }

    // ---- remote grants (a day, or a range) ----
    if (b.action === "grant_remote") {
      const from = String(b.from || ""), to = String(b.to || b.from || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: "Pick the dates." }, { status: 400 });
      if (!b.employeeId) return NextResponse.json({ error: "Pick an employee." }, { status: 400 });
      if (to < from) return NextResponse.json({ error: "End date can't be before the start." }, { status: 400 });
      await fetch(`${url}/rest/v1/remote_grants`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, employee_id: b.employeeId, from_date: from, to_date: to, reason: String(b.reason || "").slice(0, 200) || null }),
      });
      await audit({ uid, action: "attendance.remote.grant", entity: "remote_grants", entityId: b.employeeId, meta: { from, to } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "revoke_remote") {
      await fetch(`${url}/rest/v1/remote_grants?uid=eq.${uid}&id=eq.${b.id}`, { method: "DELETE", headers: H(key) });
      return NextResponse.json({ ok: true });
    }

    // ---- the settings themselves ----
    const cur = await getAttSettings(url, key, uid);
    const row: any = { uid, updated_at: new Date().toISOString() };
    if (b.enabled !== undefined) row.enabled = !!b.enabled;
    if (b.shop_lat !== undefined) row.shop_lat = b.shop_lat === null ? null : Number(b.shop_lat);
    if (b.shop_lng !== undefined) row.shop_lng = b.shop_lng === null ? null : Number(b.shop_lng);
    if (b.geofence_radius_m !== undefined) row.geofence_radius_m = num(b.geofence_radius_m, 25, 5000, cur.geofence_radius_m);
    if (b.enforce_geofence !== undefined) row.enforce_geofence = !!b.enforce_geofence;
    if (b.required_hours !== undefined) row.required_hours = num(b.required_hours, 1, 24, cur.required_hours);
    if (b.half_day_pct !== undefined) row.half_day_pct = num(b.half_day_pct, 1, 99, cur.half_day_pct);
    if (b.full_day_pct !== undefined) row.full_day_pct = num(b.full_day_pct, 2, 200, cur.full_day_pct);
    if (b.regularization_quota !== undefined) row.regularization_quota = num(b.regularization_quota, 0, 31, cur.regularization_quota);
    if (b.regularization_back_days !== undefined) row.regularization_back_days = num(b.regularization_back_days, 1, 90, cur.regularization_back_days);
    if (Array.isArray(b.default_weekly_offs)) {
      row.default_weekly_offs = b.default_weekly_offs.filter((d: any) => Number.isInteger(d) && d >= 0 && d <= 6);
    }
    // A half-day threshold at or above the full-day one would make "half"
    // unreachable — keep the pair sane whatever gets posted.
    const half = row.half_day_pct ?? cur.half_day_pct, full = row.full_day_pct ?? cur.full_day_pct;
    if (half >= full) return NextResponse.json({ error: "The half-day percentage has to be below the full-day one." }, { status: 400 });

    // Blocking with no shop location can't do anything — there's nothing to
    // measure against. Rather than silently accept a setting that does nothing,
    // say so.
    const lat = row.shop_lat !== undefined ? row.shop_lat : cur.shop_lat;
    const lng = row.shop_lng !== undefined ? row.shop_lng : cur.shop_lng;
    const enforcing = row.enforce_geofence !== undefined ? row.enforce_geofence : cur.enforce_geofence;
    if (enforcing && (lat == null || lng == null)) {
      return NextResponse.json({ error: "Set the shop location before switching on blocking — without it there's nothing to check a punch against." }, { status: 400 });
    }

    await fetch(`${url}/rest/v1/attendance_settings`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(row),
    });
    await audit({ uid, action: "attendance.settings.update", entity: "attendance_settings", entityId: uid, meta: row });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  }
}
