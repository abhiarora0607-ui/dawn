// app/api/team/notes/route.ts
// Personal notes for employees — simple, private to the employee.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guardEmployee("notes");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const rows = await (await fetch(`${url}/rest/v1/emp_notes?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=updated_at.desc&limit=100`, { headers: empHeaders(key), cache: "no-store" })).json();
    return NextResponse.json({ notes: Array.isArray(rows) ? rows : [] });
  } catch { return NextResponse.json({ notes: [] }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee("notes");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    const body = (b.body || "").trim();
    if (!body) return NextResponse.json({ error: "Note can't be empty." }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/emp_notes`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=representation" }),
      body: JSON.stringify({ uid: ctx.uid, employee_id: ctx.employeeId, body: body.slice(0, 5000) }),
    });
    const note = (await res.json())?.[0];
    return res.ok ? NextResponse.json({ note }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const g = await guardEmployee("notes");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.id || !(b.body || "").trim()) return NextResponse.json({ error: "Missing note." }, { status: 400 });
    await fetch(`${url}/rest/v1/emp_notes?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
      method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ body: String(b.body).trim().slice(0, 5000), updated_at: new Date().toISOString() }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  const g = await guardEmployee("notes");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await fetch(`${url}/rest/v1/emp_notes?id=eq.${id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, { method: "DELETE", headers: empHeaders(key) });
  return NextResponse.json({ ok: true });
}
