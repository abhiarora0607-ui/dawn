// app/api/contacts/route.ts
import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { cleanName, cleanPhone, cleanEmail } from "@/lib/validate";
import { ensureOwnerEmployee } from "@/lib/owner-employee";
import { touchActive } from "@/lib/touch";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

async function logActivity(url: string, key: string, uid: string, contactId: string, type: string, content: string, meta: any = {}) {
  await fetch(`${url}/rest/v1/activities`, {
    method: "POST", headers: H(key, { Prefer: "return=minimal" }),
    body: JSON.stringify({ uid, contact_id: contactId, type, content, meta }),
  });
}

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ contacts: [], authed: !!uid });
  const check = new URL(req.url).searchParams.get("check"); // duplicate check: phone or handle
  try {
    if (!check) await touchActive(url, key, uid); // real page load = business is active
    if (check) {
      const safe = String(check).replace(/[*(),\\]/g, "").slice(0, 60);
      const enc = encodeURIComponent(safe);
      const res = await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&or=(phone.eq.${enc},instagram_handle.eq.${enc})&select=id,name&limit=1`, { headers: H(key), cache: "no-store" });
      const rows = await res.json();
      return NextResponse.json({ duplicate: rows?.[0] || null });
    }
    const res = await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&order=created_at.desc`, { headers: H(key), cache: "no-store" });
    return NextResponse.json({ contacts: await res.json(), authed: true });
  } catch { return NextResponse.json({ contacts: [], authed: true }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });
  try {
    const b = await req.json();
    const nm = cleanName(b.name);
    if (!nm.ok) return NextResponse.json({ error: nm.error }, { status: 400 });
    const ph = cleanPhone(b.phone);
    if (!ph.ok) return NextResponse.json({ error: ph.error }, { status: 400 });
    const em = cleanEmail(b.email);
    if (!em.ok) return NextResponse.json({ error: em.error }, { status: 400 });
    // Every contact has an owner. If none was chosen, it belongs to the admin.
    const assignee = b.employeeId || (await ensureOwnerEmployee(url!, key!, uid));
    if (!assignee) return NextResponse.json({ error: "Assign this contact to someone." }, { status: 400 });
    const row = {
      uid, name: nm.value, phone: ph.value, email: em.value,
      instagram_handle: (b.instagramHandle || "").replace("@", ""), source: b.source || "Other",
      stage: b.stage || "New Lead", tags: b.tags || [], interested_item_ids: b.interestedItemIds || [],
      follow_up_date: b.followUpDate || null, notes: b.notes || "", employee_id: assignee,
    };
    const res = await fetch(`${url}/rest/v1/contacts`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }), body: JSON.stringify(row),
    });
    const created = (await res.json())?.[0];
    if (created?.id) await logActivity(url, key, uid, created.id, "note", "Contact created");
    return res.ok ? NextResponse.json({ contact: created }) : NextResponse.json({ error: "Save failed." }, { status: 500 });
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const patch: any = {};
    const map: Record<string, string> = { name: "name", phone: "phone", email: "email", source: "source", stage: "stage", notes: "notes" };
    for (const k in map) if (b[k] !== undefined) patch[map[k]] = b[k];
    if (patch.name !== undefined) { const nm = cleanName(patch.name); if (!nm.ok) return NextResponse.json({ error: nm.error }, { status: 400 }); patch.name = nm.value; }
    if (patch.phone !== undefined) { const ph = cleanPhone(patch.phone); if (!ph.ok) return NextResponse.json({ error: ph.error }, { status: 400 }); patch.phone = ph.value; }
    if (patch.email !== undefined) { const em = cleanEmail(patch.email); if (!em.ok) return NextResponse.json({ error: em.error }, { status: 400 }); patch.email = em.value; }
    // Stage rules apply only on actual transitions — fetch current stage once.
    let curStage: string | null = null;
    if (b.stage) {
      curStage = (await (await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${uid}&select=stage&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0]?.stage || null;
    }
    // A customer with a real order is LOCKED in Customer (Won). The admin can
    // override (mistaken order, refund, wrong contact) but must say why — it
    // is logged. Employees can never do this at all.
    if (b.stage && b.stage !== "Customer (Won)" && curStage === "Customer (Won)") {
      const hasOrder = (await (await fetch(`${url}/rest/v1/sales?contact_id=eq.${b.id}&uid=eq.${uid}&select=id&limit=1`, { headers: H(key), cache: "no-store" })).json())?.length > 0;
      if (hasOrder) {
        const reason = (b.unwonReason || "").trim();
        if (!reason) return NextResponse.json({ error: "This customer has orders — moving them out of Customer (Won) requires a reason.", needsUnwonReason: true }, { status: 400 });
        patch.unwon_reason = reason.slice(0, 500);
      }
    }
    // Marking Lost requires a reason — enforced here, not just in the UI.
    if (b.stage === "Lost" && curStage !== "Lost") {
      const note = (b.lostNote || "").trim();
      if (!note) return NextResponse.json({ error: "A note is required when marking a lead Lost." }, { status: 400 });
      patch.lost_reason = note.slice(0, 500);
    }
    // Marking Won requires either an existing order or an explicit reason.
    if (b.stage === "Customer (Won)" && curStage !== "Customer (Won)") {
      const wonNote = (b.wonNote || "").trim();
      if (wonNote) {
        patch.won_reason = wonNote.slice(0, 500);
      } else {
        const hasOrder = (await (await fetch(`${url}/rest/v1/sales?contact_id=eq.${b.id}&uid=eq.${uid}&select=id&limit=1`, { headers: H(key), cache: "no-store" })).json())?.length > 0;
        if (!hasOrder) return NextResponse.json({ error: "Record an order to mark this contact as won, or provide a reason for winning without one." }, { status: 400 });
      }
    }
    if (b.instagramHandle !== undefined) patch.instagram_handle = (b.instagramHandle || "").replace("@", "");
    if (b.tags !== undefined) patch.tags = b.tags;
    if (b.interestedItemIds !== undefined) patch.interested_item_ids = b.interestedItemIds;
    if (b.employeeId) patch.employee_id = b.employeeId; // never unassign
    if (b.followUpDate !== undefined) patch.follow_up_date = b.followUpDate || null;
    await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (b.stage !== undefined && b.logStage) {
      const msg = b.stage === "Lost" && b.lostNote ? `Marked Lost — ${String(b.lostNote).trim().slice(0, 300)}`
        : b.stage === "Customer (Won)" && b.wonNote ? `Marked won without an order — ${String(b.wonNote).trim().slice(0, 300)}`
        : patch.unwon_reason ? `Moved out of Customer (Won) by admin — ${String(patch.unwon_reason).slice(0, 300)}`
        : `Moved to ${b.stage}`;
      await logActivity(url, key, uid, b.id, "stage_change", msg);
    }
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
    await fetch(`${url}/rest/v1/contacts?id=eq.${id}&uid=eq.${uid}`, { method: "DELETE", headers: H(key) });
    await fetch(`${url}/rest/v1/activities?contact_id=eq.${id}&uid=eq.${uid}`, { method: "DELETE", headers: H(key) });
    await audit({ uid, action: "contact.delete", entity: "contacts", entityId: id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}
