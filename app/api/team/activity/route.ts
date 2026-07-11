// app/api/team/activity/route.ts
// Recent activity for the logged-in employee (their own actions), from the
// audit log. Real data — not a fabricated feed.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ activity: [] });
  const { ctx, url, key } = g;
  try {
    const rows = await (await fetch(`${url}/rest/v1/audit_log?uid=eq.${ctx.uid}&actor=eq.${ctx.employeeId}&order=created_at.desc&limit=20`, { headers: empHeaders(key), cache: "no-store" })).json();
    const activity = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      action: r.action, entity: r.entity, at: r.created_at, meta: r.meta,
    }));
    return NextResponse.json({ activity });
  } catch { return NextResponse.json({ activity: [] }); }
}
