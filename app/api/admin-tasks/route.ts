// app/api/admin-tasks/route.ts
// The admin's view of Tasks and Notes across the whole team — and the ability
// to create them FOR an employee. The employee sees an assigned task in their
// portal exactly like one they wrote themselves; `assigned_by` only tells the
// admin where it came from.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ensureOwnerEmployee } from "@/lib/owner-employee";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    await ensureOwnerEmployee(url, key, uid);
    const [tasks, notes, employees, contacts] = await Promise.all([
      fetch(`${url}/rest/v1/tasks?uid=eq.${uid}&order=done.asc,due_date.asc.nullslast&limit=200`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/emp_notes?uid=eq.${uid}&order=updated_at.desc&limit=100`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,is_owner&order=is_owner.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=id,name&order=created_at.desc&limit=200`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    return NextResponse.json({
      tasks: Array.isArray(tasks) ? tasks : [],
      notes: Array.isArray(notes) ? notes : [],
      employees: Array.isArray(employees) ? employees : [],
      contacts: Array.isArray(contacts) ? contacts : [],
    });
  } catch { return NextResponse.json({ tasks: [], notes: [], employees: [], contacts: [] }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const b = await req.json();
    const employeeId = b.employeeId || (await ensureOwnerEmployee(url, key, uid));
    if (!employeeId) return NextResponse.json({ error: "Choose who this is for." }, { status: 400 });

    if (b.kind === "note") {
      const body = (b.body || "").trim();
      if (!body) return NextResponse.json({ error: "The note can't be empty." }, { status: 400 });
      await fetch(`${url}/rest/v1/emp_notes`, {
        method: "POST", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ uid, employee_id: employeeId, body: body.slice(0, 5000), assigned_by: "admin" }),
      });
      await audit({ uid, action: "note.assign", entity: "emp_notes", meta: { employeeId } });
      return NextResponse.json({ ok: true });
    }

    const title = (b.title || "").trim();
    if (!title) return NextResponse.json({ error: "The task needs a title." }, { status: 400 });
    if (b.dueDate && isNaN(new Date(b.dueDate).getTime())) return NextResponse.json({ error: "That due date isn't valid." }, { status: 400 });
    await fetch(`${url}/rest/v1/tasks`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, employee_id: employeeId, title: title.slice(0, 200), due_date: b.dueDate || null, contact_id: b.contactId || null, assigned_by: "admin" }),
    });
    await audit({ uid, action: "task.assign", entity: "tasks", meta: { employeeId } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed to save." }, { status: 500 }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const table = b.kind === "note" ? "emp_notes" : "tasks";
    const patch: any = {};
    if (b.done !== undefined) { patch.done = !!b.done; patch.done_at = b.done ? new Date().toISOString() : null; }
    if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 200);
    if (b.body !== undefined) { patch.body = String(b.body).trim().slice(0, 5000); patch.updated_at = new Date().toISOString(); }
    if (b.dueDate !== undefined) patch.due_date = b.dueDate || null;
    if (b.employeeId !== undefined) patch.employee_id = b.employeeId;
    await fetch(`${url}/rest/v1/${table}?id=eq.${b.id}&uid=eq.${uid}`, { method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const p = new URL(req.url).searchParams;
  const id = p.get("id");
  const table = p.get("kind") === "note" ? "emp_notes" : "tasks";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await fetch(`${url}/rest/v1/${table}?id=eq.${id}&uid=eq.${uid}`, { method: "DELETE", headers: H(key) });
  return NextResponse.json({ ok: true });
}
