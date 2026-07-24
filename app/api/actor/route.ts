// app/api/actor/route.ts
// WHO is looking at the app shell? (V60) The single question the unified
// dashboard asks before rendering anything. Owner session → owner. Employee
// session → the identity facts the nav registry gates on: effective
// permissions, admin/lead position, department flavor. Neither → kind null,
// and the shell shows nothing it shouldn't.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { guardEmployee } from "@/lib/employee-auth";
import { loadOrg } from "@/lib/org-db";
import { flavorOfDepartment } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;

  // Owner first — an owner who also once had an employee cookie is the owner.
  const uid = await getUid();
  if (uid) return NextResponse.json({ kind: "owner" });

  if (!url || !key) return NextResponse.json({ kind: null });

  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ kind: null });
  const ctx: any = g.ctx;

  try {
    const org = await loadOrg(url, key, ctx.uid, ctx.employeeId);
    const me = (org.employees || []).find((e: any) => e.id === ctx.employeeId);
    const d = (org.departments || []).find((x: any) => x.id === me?.department_id);
    return NextResponse.json({
      kind: "employee",
      name: me?.name || "there",
      permissions: ctx.permissions || [],
      isAdmin: !!org.isAdmin,
      isLead: (org.myTeam?.length ?? 0) > 0,
      dept: flavorOfDepartment(d?.name),
    });
  } catch {
    // Session is valid even if org lookup hiccups — degrade to the floor.
    return NextResponse.json({ kind: "employee", name: "there", permissions: ctx.permissions || [], isAdmin: false, isLead: false, dept: "none" });
  }
}
