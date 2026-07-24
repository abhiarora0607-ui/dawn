// app/api/leave/settings/route.ts
// The owner tunes the catalogue: how much each type gives, how often, whether
// it carries forward, whether it can be encashed. Names are fixed — the owner
// changes policy, not vocabulary.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { requireArea } from "@/lib/entitlements";
import { getAttSettings } from "@/lib/attendance-db";
import { getLeaveTypes } from "@/lib/leave-db";
import { LEAVE_LABEL, LEAVE_HINT, LEAVE_CODES } from "@/lib/leave";
import { audit } from "@/lib/audit";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";

async function ctx() {
  const uid = await getUid();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!uid || !url || !key) return null;
  return { uid, url, key, blocked: await requireArea(url, key, uid, "crm") };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, url, key } = c;

  const [types, settings] = await Promise.all([
    getLeaveTypes(url, key, uid),
    getAttSettings(url, key, uid),
  ]);
  return NextResponse.json({
    types: types.map((t) => ({ ...t, label: LEAVE_LABEL[t.code], hint: LEAVE_HINT[t.code] })),
    caps: {
      leave_enabled: (settings as any).leave_enabled !== false,
      carry_forward_cap: (settings as any).carry_forward_cap ?? 12,
      encash_cap: (settings as any).encash_cap ?? 5,
    },
  });
}

export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (c.blocked) return NextResponse.json(c.blocked, { status: 403 });
  const { uid, url, key } = c;

  try {
    const b = await req.json();

    // ---- year-end caps ----
    if (b.action === "caps") {
      const row: any = { uid, updated_at: new Date().toISOString() };
      if (b.leave_enabled !== undefined) row.leave_enabled = !!b.leave_enabled;
      if (b.carry_forward_cap !== undefined) row.carry_forward_cap = Math.max(0, Math.min(365, Number(b.carry_forward_cap) || 0));
      if (b.encash_cap !== undefined) row.encash_cap = Math.max(0, Math.min(365, Number(b.encash_cap) || 0));
      await fetch(`${url}/rest/v1/attendance_settings`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(row),
      });
      await audit({ uid, action: "leave.caps.update", entity: "attendance_settings", entityId: uid, meta: row });
      return NextResponse.json({ ok: true });
    }

    // ---- one leave type ----
    const code = String(b.code || "");
    if (!LEAVE_CODES.includes(code as any)) return NextResponse.json({ error: "Unknown leave type." }, { status: 400 });
    if (code === "unpaid" && b.enabled === false) {
      // Unpaid is the safety net the whole design leans on — if a balance runs
      // out and unpaid is off, there'd be nowhere to record a real day off.
      return NextResponse.json({ error: "Unpaid leave can't be switched off — it's what people fall back on when a balance runs out." }, { status: 400 });
    }

    const row: any = { uid, code, updated_at: new Date().toISOString() };
    if (b.accrual !== undefined && ["monthly", "yearly", "none"].includes(b.accrual)) row.accrual = b.accrual;
    if (b.amount !== undefined) row.amount = Math.max(0, Math.min(365, Number(b.amount) || 0));
    if (b.enabled !== undefined) row.enabled = !!b.enabled;
    if (b.carries_forward !== undefined) row.carries_forward = !!b.carries_forward;
    if (b.encashable !== undefined) row.encashable = !!b.encashable;

    await fetch(`${url}/rest/v1/leave_types`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(row),
    });
    await audit({ uid, action: "leave.type.update", entity: "leave_types", entityId: code, meta: row });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Couldn't save." }, { status: 500 }); }
}
