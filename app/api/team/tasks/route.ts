// app/api/team/tasks/route.ts
// Real task management for employees. Tasks are personal (scoped to the
// employee) and optionally linked to one of their contacts.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee("tasks");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const rows = await (await fetch(`${url}/rest/v1/tasks?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=done.asc,due_date.asc.nullslast,created_at.desc&limit=200`, { headers: empHeaders(key), cache: "no-store" })).json();
    return NextResponse.json({ tasks: Array.isArray(rows) ? rows : [] });
  } catch { return NextResponse.json({ tasks: [] }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee("tasks");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    const title = (b.title || "").trim();
    if (!title) return NextResponse.json({ error: "Task title is required." }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/tasks`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=representation" }),
      body: JSON.stringify({ uid: ctx.uid, employee_id: ctx.employeeId, title: title.slice(0, 200), due_date: b.dueDate || null, contact_id: b.contactId || null }),
    });
    const task = (await res.json())?.[0];
    return res.ok ? NextResponse.json({ task }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const g = await guardEmployee("tasks");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const patch: any = {};
    if (b.done !== undefined) { patch.done = !!b.done; patch.done_at = b.done ? new Date().toISOString() : null; }
    if (b.title !== undefined) patch.title = String(b.title).trim().slice(0, 200);
    if (b.dueDate !== undefined) patch.due_date = b.dueDate || null;
    await fetch(`${url}/rest/v1/tasks?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
      method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const g = await guardEmployee("tasks");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await fetch(`${url}/rest/v1/tasks?id=eq.${id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, { method: "DELETE", headers: empHeaders(key) });
  return NextResponse.json({ ok: true });
}
