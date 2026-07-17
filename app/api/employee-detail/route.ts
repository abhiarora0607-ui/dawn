// app/api/employee-detail/route.ts
// The employee hub: one call that gathers everything a single staff member
// owns — their contacts, orders, open tasks, salary history, and a performance
// snapshot. Turns the most under-connected object into a real record.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string) { return { apikey: key, Authorization: `Bearer ${key}` }; }

const OPEN = ["New Lead", "Contacted", "Negotiating"];

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const [empRows, contacts, salesRaw, tasks, expenses, scoreRows] = await Promise.all([
      fetch(`${url}/rest/v1/employees?id=eq.${id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&employee_id=eq.${id}&select=id,name,phone,stage,follow_up_date&order=created_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&employee_id=eq.${id}&select=id,contact_id,total,amount_paid,balance,status,order_status,date,items&order=date.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/tasks?uid=eq.${uid}&employee_id=eq.${id}&select=id,title,due_date,done&order=done.asc,due_date.asc.nullslast`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&source=eq.salary&source_id=eq.${id}&select=amount,date,recurring&order=date.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employee_scores?uid=eq.${uid}&employee_id=eq.${id}&order=month.desc&limit=24`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const emp = empRows?.[0];
    if (!emp) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const C = Array.isArray(contacts) ? contacts : [];
    const S = (Array.isArray(salesRaw) ? salesRaw : []).filter((s: any) => s.order_status !== "Cancelled");
    const T = Array.isArray(tasks) ? tasks : [];
    const salary = Array.isArray(expenses) ? expenses : [];

    // Attach customer name onto each order for display.
    const nameById: Record<string, string> = {};
    for (const c of C) nameById[c.id] = c.name;

    const won = C.filter((c: any) => c.stage === "Customer (Won)").length;
    const decided = C.filter((c: any) => ["Customer (Won)", "Lost"].includes(c.stage)).length;
    const revenue = S.reduce((a: number, s: any) => a + (Number(s.amount_paid) || 0), 0);
    const pending = S.reduce((a: number, s: any) => a + (Number(s.balance) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);

    const history = Array.isArray(scoreRows) ? scoreRows : [];
    const thisYear = String(new Date().getFullYear());
    const yearRows = history.filter((r: any) => r.month.startsWith(thisYear));
    const yearSummary = yearRows.length > 0 ? {
      months: yearRows.length,
      avgScore: Math.round(yearRows.reduce((a: number, r: any) => a + r.score, 0) / yearRows.length),
      timesTop: yearRows.filter((r: any) => r.is_top).length,
      bestMonth: yearRows.reduce((b: any, r: any) => (r.score > (b?.score ?? -1) ? r : b), null)?.month || null,
    } : null;

    return NextResponse.json({
      employee: emp,
      scoreHistory: history,
      yearSummary,
      stats: {
        openLeads: C.filter((c: any) => OPEN.includes(c.stage)).length,
        customers: won,
        orders: S.length,
        revenue,
        pending,
        conversion: decided > 0 ? Math.round((won / decided) * 100) : null,
        overdueFollowUps: C.filter((c: any) => OPEN.includes(c.stage) && c.follow_up_date && c.follow_up_date < today).length,
        openTasks: T.filter((t: any) => !t.done).length,
      },
      contacts: C.slice(0, 50),
      orders: S.slice(0, 50).map((s: any) => ({ ...s, customerName: s.contact_id ? nameById[s.contact_id] || "Customer" : "Walk-in" })),
      tasks: T.filter((t: any) => !t.done).slice(0, 30),
      salaryHistory: salary.slice(0, 12),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  }
}
