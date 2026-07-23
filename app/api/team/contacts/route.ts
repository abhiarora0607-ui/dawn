// app/api/team/contacts/route.ts
// Employee-scoped contacts. Employees see and create ONLY their own contacts
// (employee_id is stamped server-side, never trusted from the client).

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders, hasPermission } from "@/lib/employee-auth";
import { cleanName, cleanPhone, cleanEmail } from "@/lib/validate";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guardEmployee("leads");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const filter = new URL(req.url).searchParams.get("filter"); // leads | customers | all
  try {
    // full-scan: employee's own book, naturally small
    const rows = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${ctx.uid}&deleted_at=is.null&employee_id=eq.${ctx.employeeId}&order=created_at.desc`, { headers: empHeaders(key), cache: "no-store" })).json();
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
    const nm = cleanName(b.name);
    if (!nm.ok) return NextResponse.json({ error: nm.error }, { status: 400 });
    const ph = cleanPhone(b.phone);
    if (!ph.ok) return NextResponse.json({ error: ph.error }, { status: 400 });
    const em = cleanEmail(b.email);
    if (!em.ok) return NextResponse.json({ error: em.error }, { status: 400 });
    // Employees create LEADS. Customers are created by recording an order.
    const LEAD_STAGES = ["New Lead", "Contacted", "Negotiating"];
    const stage = LEAD_STAGES.includes(b.stage) ? b.stage : "New Lead";
    // Hard duplicate block for employees: same phone or handle anywhere in
    // this business = stop. Prevents two employees fighting over one contact.
    const handle = (b.instagramHandle || "").replace("@", "").trim();
    if (ph.value || handle) {
      const ors: string[] = [];
      if (ph.value) ors.push(`phone.eq.${encodeURIComponent(ph.value)}`);
      if (handle) ors.push(`instagram_handle.eq.${encodeURIComponent(handle)}`);
      const dup = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${ctx.uid}&deleted_at=is.null&or=(${ors.join(",")})&select=id,employee_id&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json();
      if (Array.isArray(dup) && dup.length > 0) {
        const mine = dup[0].employee_id === ctx.employeeId;
        return NextResponse.json({ error: mine ? "You already have a contact with this phone or handle." : "This contact already exists in the business — ask your admin about the assignment." }, { status: 409 });
      }
    }
    // employee_id is FORCED to the logged-in employee — cannot assign to others.
    const row = {
      uid: ctx.uid, name: nm.value, phone: ph.value, email: em.value,
      instagram_handle: handle, source: b.source || "Other",
      stage, notes: b.notes || "", employee_id: ctx.employeeId,
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

    const needed = owned.stage === "Customer (Won)" ? "customers_edit" : "leads_edit";
    if (!hasPermission(ctx, needed)) {
      return NextResponse.json({ error: "You don't have permission to edit this." }, { status: 403 });
    }

    const patch: any = {};
    for (const f of ["name", "phone", "email", "source", "stage", "notes"]) if (b[f] !== undefined) patch[f] = b[f];
    if (b.instagramHandle !== undefined) patch.instagram_handle = (b.instagramHandle || "").replace("@", "");
    if (b.followUpDate !== undefined) patch.follow_up_date = b.followUpDate || null;
    if (patch.name !== undefined) { const nm = cleanName(patch.name); if (!nm.ok) return NextResponse.json({ error: nm.error }, { status: 400 }); patch.name = nm.value; }
    if (patch.phone !== undefined) { const ph = cleanPhone(patch.phone); if (!ph.ok) return NextResponse.json({ error: ph.error }, { status: 400 }); patch.phone = ph.value; }
    if (patch.email !== undefined) { const em = cleanEmail(patch.email); if (!em.ok) return NextResponse.json({ error: em.error }, { status: 400 }); patch.email = em.value; }

    // A customer with orders is locked in Customer (Won) for employees. No
    // override exists here — only the admin can reverse a booked sale.
    if (b.stage && b.stage !== "Customer (Won)" && owned.stage === "Customer (Won)") {
      const hasOrder = (await (await fetch(`${url}/rest/v1/sales?contact_id=eq.${b.id}&uid=eq.${ctx.uid}&select=id&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.length > 0;
      if (hasOrder) return NextResponse.json({ error: "This customer has orders and can't be moved out of Customer (Won). Ask your admin." }, { status: 403 });
    }
    // Marking Lost requires a reason — enforced server-side (only when the
    // stage is actually changing, not when re-saving an already-Lost contact).
    if (b.stage === "Lost" && owned.stage !== "Lost") {
      const note = (b.lostNote || "").trim();
      if (!note) return NextResponse.json({ error: "A note is required when marking a lead Lost." }, { status: 400 });
      patch.lost_reason = note.slice(0, 500);
    }
    // Marking Won requires an existing order or an explicit reason (only on transition).
    if (b.stage === "Customer (Won)" && owned.stage !== "Customer (Won)") {
      const wonNote = (b.wonNote || "").trim();
      if (wonNote) {
        patch.won_reason = wonNote.slice(0, 500);
      } else {
        const hasOrder = (await (await fetch(`${url}/rest/v1/sales?contact_id=eq.${b.id}&uid=eq.${ctx.uid}&select=id&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.length > 0;
        if (!hasOrder) return NextResponse.json({ error: "Record an order to mark this contact as won, or provide a reason for winning without one." }, { status: 400 });
      }
    }

    await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}`, {
      method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (b.stage && b.stage !== owned.stage) {
      const msg = b.stage === "Lost" ? `Marked Lost — ${String(b.lostNote).trim().slice(0, 300)} (by ${ctx.name || "employee"})`
        : b.stage === "Customer (Won)" && b.wonNote ? `Marked won without an order — ${String(b.wonNote).trim().slice(0, 300)} (by ${ctx.name || "employee"})`
        : `Moved to ${b.stage} by ${ctx.name || "employee"}`;
      await fetch(`${url}/rest/v1/activities`, { method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid: ctx.uid, contact_id: b.id, type: "stage_change", content: msg }) });
    }
    await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "contact.update", entity: "contacts", entityId: b.id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Update failed." }, { status: 500 }); }
}
