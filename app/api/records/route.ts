// app/api/records/route.ts
// Admin "Records" console: list, edit and delete rows of ANY object in the CRM
// from one place. Writes are routed through the same rules as the normal UI —
// this is a faster door into the product, not a back door around it.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { softDelete } from "@/lib/soft-delete";
import { getUid } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cleanName, cleanPhone, cleanEmail } from "@/lib/validate";
import { OBJECTS } from "@/lib/objects";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

export async function GET(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  const p = new URL(req.url).searchParams;
  const obj = p.get("object") || "contacts";
  const spec = OBJECTS[obj];
  if (!spec) return NextResponse.json({ error: "Unknown object." }, { status: 400 });
  try {
    const filter = `uid=eq.${uid}${["contacts","sales","catalog_items","expenses"].includes(spec.table) ? "&deleted_at=is.null" : ""}`;
    const [rowsRes, employees] = await Promise.all([
      fetch(`${url}/rest/v1/${spec.table}?${filter}&order=${spec.order}&limit=1000`, { headers: { ...H(key), Prefer: "count=exact" }, cache: "no-store" }),
      fetch(`${url}/rest/v1/employees?uid=eq.${uid}&select=id,name,is_owner&order=is_owner.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    const rows = await rowsRes.json();
    const total = Number(rowsRes.headers.get("content-range")?.split("/")[1] || (Array.isArray(rows) ? rows.length : 0));
    return NextResponse.json({
      rows: Array.isArray(rows) ? rows : [],
      total,
      shown: Array.isArray(rows) ? rows.length : 0,
      employees: Array.isArray(employees) ? employees : [],
      editable: spec.editable,
      labelField: spec.label_field,
      objects: Object.entries(OBJECTS).map(([k, v]) => ({ key: k, label: v.label })),
    });
  } catch { return NextResponse.json({ rows: [], employees: [] }); }
}

export async function PATCH(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const b = await req.json();
    const spec = OBJECTS[b.object];
    if (!spec || !b.id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    if (spec.editable.length === 0) return NextResponse.json({ error: "This object is read-only — it's a historical record." }, { status: 400 });

    // Contacts are special: they carry the pipeline rules. Route the whole
    // update through the real contacts API rather than duplicating the logic.
    if (b.object === "contacts") {
      const origin = new URL(req.url).origin;
      const res = await fetch(`${origin}/api/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") || "" },
        body: JSON.stringify({ ...b.patch, id: b.id, logStage: b.patch?.stage !== undefined }),
      });
      const d = await res.json().catch(() => ({}));
      return NextResponse.json(d, { status: res.status });
    }

    // Whitelist fields, then validate the ones we know how to check.
    const patch: any = {};
    for (const f of spec.editable) if (b.patch?.[f] !== undefined) patch[f] = b.patch[f];
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    if (patch.name !== undefined) { const v = cleanName(patch.name); if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 }); patch.name = v.value; }
    if (patch.phone !== undefined) { const v = cleanPhone(patch.phone); if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 }); patch.phone = v.value; }
    if (patch.email !== undefined) { const v = cleanEmail(patch.email); if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 }); patch.email = v.value; }
    for (const money of ["price", "cost", "amount", "monthly_salary", "compare_at_price"]) {
      if (patch[money] !== undefined && patch[money] !== null && patch[money] !== "") {
        const n = Number(patch[money]);
        if (isNaN(n) || n < 0) return NextResponse.json({ error: `${money.replace(/_/g, " ")} must be a number of 0 or more.` }, { status: 400 });
        patch[money] = n;
      }
    }
    // An employee record that is the owner can't be deactivated out of existence.
    if (b.object === "employees" && patch.status === "inactive") {
      const t = (await (await fetch(`${url}/rest/v1/employees?id=eq.${b.id}&uid=eq.${uid}&select=is_owner&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
      if (t?.is_owner) return NextResponse.json({ error: "The owner record must stay active." }, { status: 400 });
    }

    const res = await fetch(`${url}/rest/v1/${spec.table}?id=eq.${b.id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(patch),
    });
    if (!res.ok) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    await audit({ uid, action: `${b.object}.update`, entity: spec.table, entityId: b.id, meta: { via: "records console" } });
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
  const obj = p.get("object") || "";
  const id = p.get("id") || "";
  const spec = OBJECTS[obj];
  if (!spec || !id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (obj === "audit" || obj === "activities") return NextResponse.json({ error: "History can't be deleted — that's the point of an audit trail." }, { status: 400 });
  try {
    if (obj === "employees") {
      const t = (await (await fetch(`${url}/rest/v1/employees?id=eq.${id}&uid=eq.${uid}&select=is_owner&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
      if (t?.is_owner) return NextResponse.json({ error: "The owner record can't be deleted — it's the default assignee." }, { status: 400 });
    }
    // The value tables soft-delete (recoverable 30 days); a deleted contact
    // also soft-deletes its orders so finance stays correct.
    const SOFT = new Set(["contacts", "sales", "catalog_items", "expenses"]);
    if (SOFT.has(spec.table)) {
      if (obj === "contacts") {
        await fetch(`${url}/rest/v1/sales?contact_id=eq.${id}&uid=eq.${uid}`, {
          method: "PATCH", headers: { ...H(key), "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ deleted_at: new Date().toISOString() }),
        });
      }
      await softDelete(url, key, spec.table, id, uid);
    } else {
      await fetch(`${url}/rest/v1/${spec.table}?id=eq.${id}&uid=eq.${uid}`, { method: "DELETE", headers: H(key) });
    }
    await audit({ uid, action: `${obj}.delete`, entity: spec.table, entityId: id, meta: { via: "records console", soft: SOFT.has(spec.table) } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Delete failed." }, { status: 500 }); }
}
