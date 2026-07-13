// app/api/employees/route.ts
// Employees + automatic salary recurring-expense sync.
//  - Creating an active employee creates a salary recurring_expense.
//  - Toggling inactive disables it (future salary stops; past rows untouched).
//  - Toggling active re-enables it.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { ensureOwnerEmployee } from "@/lib/owner-employee";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) { return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra }; }

async function syncSalaryRecurring(url: string, key: string, uid: string, emp: any) {
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const today = new Date().toISOString().slice(0, 10);
  const enabled = emp.status === "active";

  // Find existing salary recurring for this employee
  const existing = await (await fetch(`${url}/rest/v1/recurring_expenses?uid=eq.${uid}&employee_id=eq.${emp.id}&source=eq.salary&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json();
  let rec = existing?.[0];

  if (rec?.id) {
    await fetch(`${url}/rest/v1/recurring_expenses?id=eq.${rec.id}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ amount: emp.monthly_salary, enabled, note: `Salary — ${emp.name}` }),
    });
  } else if (enabled) {
    const created = await (await fetch(`${url}/rest/v1/recurring_expenses`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }),
      body: JSON.stringify({ uid, source: "salary", employee_id: emp.id, category: "Salaries", amount: emp.monthly_salary, note: `Salary — ${emp.name}`, enabled: true }),
    })).json();
    rec = created?.[0];
  }

  // Post THIS month's salary immediately (once) when active. The cron handles
  // future months; this makes the expense appear right away.
  if (enabled && rec && rec.last_generated !== month) {
    await fetch(`${url}/rest/v1/expenses`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, date: today, category: "Salaries", amount: emp.monthly_salary, note: `Salary — ${emp.name}`, source: "salary", source_id: emp.id, recurring: true }),
    });
    await fetch(`${url}/rest/v1/recurring_expenses?id=eq.${rec.id}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ last_generated: month }),
    });
  }
}

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ employees: [] });
  try {
    // Guarantee the default owner-employee exists so assignment is always possible.
    await ensureOwnerEmployee(url, key, uid);
    const res = await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&order=is_owner.desc,created_at.desc`, { headers: H(key), cache: "no-store" });
    return NextResponse.json({ employees: await res.json() });
  } catch { return NextResponse.json({ employees: [] }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (b.monthlySalary != null && Number(b.monthlySalary) < 0) return NextResponse.json({ error: "Salary can't be negative." }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/employees`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }),
      body: JSON.stringify({ uid, name: b.name.trim(), status: b.status || "active", monthly_salary: Number(b.monthlySalary) || 0, joining_date: b.joiningDate || null, phone: b.phone || "", role: b.role || "", email: b.email || "" }),
    });
    const emp = (await res.json())?.[0];
    if (emp) await syncSalaryRecurring(url, key, uid, emp);
    return NextResponse.json({ employee: emp });
  } catch { return NextResponse.json({ error: "Save failed." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const patch: any = {};
    if (b.name !== undefined) patch.name = b.name;
    if (b.status !== undefined) patch.status = b.status;
    if (b.monthlySalary !== undefined) patch.monthly_salary = Number(b.monthlySalary) || 0;
    if (b.joiningDate !== undefined) patch.joining_date = b.joiningDate || null;
    if (b.phone !== undefined) patch.phone = b.phone;
    if (b.role !== undefined) patch.role = b.role;
    if (b.email !== undefined) patch.email = b.email;
    await fetch(`${url}/rest/v1/employees?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    const emp = (await (await fetch(`${url}/rest/v1/employees?id=eq.${b.id}&uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    if (emp) await syncSalaryRecurring(url, key, uid, emp);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    // The owner-employee is permanent — it's the fallback assignee.
    const target = (await (await fetch(`${url}/rest/v1/employees?id=eq.${id}&uid=eq.${uid}&select=is_owner&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
    if (target?.is_owner) return NextResponse.json({ error: "The owner record can't be deleted — it's the default assignee." }, { status: 400 });
    // Disable salary recurring (keep past expense rows intact)
    await fetch(`${url}/rest/v1/recurring_expenses?uid=eq.${uid}&employee_id=eq.${id}`, { method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ enabled: false }) });
    await fetch(`${url}/rest/v1/employees?id=eq.${id}&uid=eq.${uid}`, { method: "DELETE", headers: H(key) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}
