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
      follow_up_date: b.followUpDate || null,
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
  // Base auth first; the specific edit permission depends on what the
  // contact currently is (lead vs customer).
  const g = await guardEmployee();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    // Verify ownership and load current stage to pick the right permission.
    const owned = (await (await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=id,stage,name&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
    if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const needed = owned.stage === "Customer (Won)" ? "edit_customers" : "edit_leads";
    if (!ctx.permissions.includes(needed)) {
      return NextResponse.json({ error: "You don't have permission to edit this." }, { status: 403 });
    }

    const patch: any = {};
    for (const f of ["name", "phone", "email", "source", "stage", "notes"]) if (b[f] !== undefined) patch[f] = b[f];
    if (b.instagramHandle !== undefined) patch.instagram_handle = (b.instagramHandle || "").replace("@", "");
    if (b.followUpDate !== undefined) patch.follow_up_date = b.followUpDate || null;

    // Marking Lost requires a reason — enforced server-side.
    if (b.stage === "Lost") {
      const note = (b.lostNote || "").trim();
      if (!note) return NextResponse.json({ error: "A note is required when marking a lead Lost." }, { status: 400 });
      patch.lost_reason = note.slice(0, 500);
    }

    await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
      method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (b.stage) {
      const msg = b.stage === "Lost" ? `Marked Lost — ${String(b.lostNote).trim().slice(0, 300)} (by ${ctx.name || "employee"})` : `Moved to ${b.stage} by ${ctx.name || "employee"}`;
      await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid: ctx.uid, contact_id: b.id, type: "stage_change", content: msg }) });
    }
    await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "contact.update", entity: "contacts", entityId: b.id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}
