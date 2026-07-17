// app/api/audit/route.ts
// Admin-only view of the audit trail. The data has been collected since the
// portal launched — this makes it visible.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";

function sb() {
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
}

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const H = { apikey: key!, Authorization: `Bearer ${key}` } as any;
    const [logs, emps] = await Promise.all([
      fetch(`${url}/rest/v1/audit_log?uid=eq.${uid}&order=created_at.desc&limit=60`, { headers: H, cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name`, { headers: H, cache: "no-store" }).then((r) => r.json()),
    ]);
    const names: Record<string, string> = {};
    for (const e of Array.isArray(emps) ? emps : []) names[e.id] = e.name;
    const out = (Array.isArray(logs) ? logs : []).map((l: any) => ({
      at: l.created_at,
      action: l.action,
      actor: l.actor_type === "employee" ? (names[l.actor] || "Employee") : "You (admin)",
      entity: l.entity,
    }));
    return NextResponse.json({ logs: out });
  } catch { return NextResponse.json({ logs: [] }); }
}
