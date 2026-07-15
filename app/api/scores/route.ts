// app/api/scores/route.ts
// The scoring surface. GET returns either the LIVE current-month ranking
// (computed fresh from lib/scoring) or a FROZEN past month (read from
// employee_scores). ?month=YYYY-MM selects; omitted = live current month.
// Also returns the list of frozen months available, for month selectors.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { computeScores, monthKey } from "@/lib/scoring";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const p = new URL(req.url).searchParams;
  const askMonth = p.get("month");
  const current = monthKey();

  try {
    // Which months have frozen history (for the selector)?
    const monthsRows = await fetch(`${url}/rest/v1/employee_scores?uid=eq.${uid}&select=month&order=month.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const frozenMonths: string[] = Array.from(new Set((Array.isArray(monthsRows) ? monthsRows : []).map((r: any) => r.month)));

    // A past month = frozen snapshot, read-only.
    if (askMonth && askMonth !== current) {
      const rows = await fetch(`${url}/rest/v1/employee_scores?uid=eq.${uid}&month=eq.${askMonth}&order=rank.asc.nullslast`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
      const emps = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
      const nameById: Record<string, string> = {};
      for (const e of Array.isArray(emps) ? emps : []) nameById[e.id] = e.name;
      const scores = (Array.isArray(rows) ? rows : []).map((r: any) => ({
        employeeId: r.employee_id, name: nameById[r.employee_id] || "Former employee",
        score: r.score, rank: r.rank, tooNew: false, eligible: r.rank != null,
        breakdown: r.breakdown || {}, isTop: r.is_top, isBottom: r.is_bottom,
      }));
      return NextResponse.json({ live: false, month: askMonth, frozenMonths, scores,
        top: scores.find((s: any) => s.isTop) || null, bottom: scores.find((s: any) => s.isBottom) || null });
    }

    // Live current month: compute from source of truth.
    const [employees, contacts, salesRaw, tasks, activities] = await Promise.all([
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,status,is_owner,joining_date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=id,stage,employee_id,follow_up_date,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&select=employee_id,amount_paid,date,order_status`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/tasks?uid=eq.${uid}&select=employee_id,done,done_at,due_date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/activities?uid=eq.${uid}&select=contact_id,type,content,created_at&order=created_at.desc&limit=2000`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const result = computeScores({
      employees: Array.isArray(employees) ? employees : [],
      contacts: Array.isArray(contacts) ? contacts : [],
      sales: (Array.isArray(salesRaw) ? salesRaw : []).filter((s: any) => s.order_status !== "Cancelled"),
      tasks: Array.isArray(tasks) ? tasks : [],
      activities: Array.isArray(activities) ? activities : [],
    });

    return NextResponse.json({ live: true, month: result.month, frozenMonths, scores: result.scores, top: result.top, bottom: result.bottom });
  } catch {
    return NextResponse.json({ error: "Couldn't compute scores." }, { status: 500 });
  }
}
