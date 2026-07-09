// app/api/contacts/route.ts
import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
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
    if (check) {
      const res = await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&or=(phone.eq.${encodeURIComponent(check)},instagram_handle.eq.${encodeURIComponent(check)})&select=id,name&limit=1`, { headers: H(key), cache: "no-store" });
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
    if (!b.name?.trim()) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const row = {
      uid, name: b.name.trim(), phone: b.phone || "", email: b.email || "",
      instagram_handle: (b.instagramHandle || "").replace("@", ""), source: b.source || "Other",
      stage: b.stage || "New Lead", tags: b.tags || [], interested_item_ids: b.interestedItemIds || [],
      follow_up_date: b.followUpDate || null, notes: b.notes || "", employee_id: b.employeeId || null,
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
    if (b.instagramHandle !== undefined) patch.instagram_handle = (b.instagramHandle || "").replace("@", "");
    if (b.tags !== undefined) patch.tags = b.tags;
    if (b.interestedItemIds !== undefined) patch.interested_item_ids = b.interestedItemIds;
    if (b.employeeId !== undefined) patch.employee_id = b.employeeId || null;
    if (b.followUpDate !== undefined) patch.follow_up_date = b.followUpDate || null;
    await fetch(`${url}/rest/v1/contacts?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (b.stage !== undefined && b.logStage) await logActivity(url, key, uid, b.id, "stage_change", `Moved to ${b.stage}`);
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
