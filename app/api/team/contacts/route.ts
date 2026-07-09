// app/api/team/contacts/route.ts
// Employee-scoped contacts. Employees see and create ONLY their own contacts
// (employee_id is stamped server-side, never trusted from the client).

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardEmployee("leads");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const filter = new URL(req.url).searchParams.get("filter"); // leads | customers | all
  try {
    const rows = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=created_at.desc`, { headers: empHeaders(key), cache: "no-store" })).json();
    let all = Array.isArray(rows) ? rows : [];
    if (filter === "leads") all = all.filter((c: any) => !["Customer (Won)", "Lost"].includes(c.stage));
    if (filter === "customers") all = all.filter((c: any) => c.stage === "Customer (Won)");
    return NextResponse.json({ contacts: all });
  } catch { return NextResponse.json({ contacts: [] }); }
}

export async function POST(req: Request) {
  const g = await guardEmployee("leads");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    // employee_id is FORCED to the logged-in employee — cannot assign to others.
    const row = {
      uid: ctx.uid, name: b.name.trim(), phone: b.phone || "", email: b.email || "",
      instagram_handle: (b.instagramHandle || "").replace("@", ""), source: b.source || "Other",
      stage: b.stage || "New Lead", notes: b.notes || "", employee_id: ctx.employeeId,
    };
    const res = await fetch(`${url}/rest/v1/contacts`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=representation" }), body: JSON.stringify(row),
    });
    const created = (await res.json())?.[0];
    if (created?.id) {
      await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid: ctx.uid, contact_id: created.id, type: "note", content: `Lead created by ${ctx.name || "employee"}` }) });
      await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "contact.create", entity: "contacts", entityId: created.id });
    }
    return res.ok ? NextResponse.json({ contact: created }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const g = await guardEmployee("leads");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    // Verify this contact belongs to this employee before editing.
    const owned = (await (await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=id&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
    if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const patch: any = {};
    for (const f of ["name", "phone", "email", "source", "stage", "notes"]) if (b[f] !== undefined) patch[f] = b[f];
    if (b.followUpDate !== undefined) patch.follow_up_date = b.followUpDate || null;
    await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
      method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (b.stage) await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid: ctx.uid, contact_id: b.id, type: "stage_change", content: `Moved to ${b.stage} by ${ctx.name || "employee"}` }) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}
