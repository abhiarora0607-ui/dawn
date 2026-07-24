// app/api/recovery/route.ts
// The "Recently deleted" area. GET lists soft-deleted contacts, orders, items
// and expenses from the last 30 days; POST restores one. Owner-only (uses
// getUid, and lives outside the team surface). All uid-scoped.

import { NextResponse } from "next/server";
import { requireArea } from "@/lib/entitlements";
import { getUid } from "@/lib/auth";
import { restore, RECOVERY_WINDOW_DAYS } from "@/lib/soft-delete";
import { audit } from "@/lib/audit";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }

const TABLES = ["contacts", "sales", "catalog_items", "expenses"] as const;
const ALLOWED = new Set<string>(TABLES);

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ items: [] });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });

  const cutoff = new Date(Date.now() - RECOVERY_WINDOW_DAYS * 86400000).toISOString();
  try {
    const [contacts, sales, items, expenses] = await Promise.all([
      // full-scan: recycle-bin window, date-bounded
      fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&deleted_at=not.is.null&deleted_at=gte.${cutoff}&select=id,name,deleted_at&order=deleted_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${uid}&deleted_at=not.is.null&deleted_at=gte.${cutoff}&select=id,total,contact_id,deleted_at&order=deleted_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/catalog_items?uid=eq.${uid}&deleted_at=not.is.null&deleted_at=gte.${cutoff}&select=id,name,deleted_at&order=deleted_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      // full-scan: recycle-bin window, date-bounded
      fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&deleted_at=not.is.null&deleted_at=gte.${cutoff}&select=id,note,amount,category,deleted_at&order=deleted_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const mk = (rows: any[], kind: string, label: (r: any) => string) =>
      (Array.isArray(rows) ? rows : []).map((r: any) => ({ id: r.id, kind, label: label(r), deletedAt: r.deleted_at }));

    const list = [
      ...mk(contacts, "contact", (r) => r.name || "Contact"),
      ...mk(sales, "order", (r) => `Order ₹${r.total || 0}`),
      ...mk(items, "item", (r) => r.name || "Item"),
      ...mk(expenses, "expense", (r) => r.note || r.category || "Expense"),
    ].sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    return NextResponse.json({ items: list, windowDays: RECOVERY_WINDOW_DAYS });
  } catch {
    return NextResponse.json({ items: [] });
  }
}

const KIND_TABLE: Record<string, string> = { contact: "contacts", order: "sales", item: "catalog_items", expense: "expenses" };

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const _area = await requireArea(url, key, uid, "crm");
  if (_area) return NextResponse.json(_area, { status: 403 });
  try {
    const b = await req.json();
    const table = KIND_TABLE[b.kind];
    if (!table || !ALLOWED.has(table) || !b.id) return NextResponse.json({ error: "Bad request." }, { status: 400 });

    await restore(url, key, table, b.id, uid);
    // Restoring an order also restores its linked cost expense.
    if (table === "sales") {
      await fetch(`${url}/rest/v1/expenses?uid=eq.${uid}&source=eq.order&source_id=eq.${b.id}`, {
        method: "PATCH", headers: { ...H(key), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ deleted_at: null }),
      });
    }
    await audit({ uid, action: `${b.kind}.restore`, entity: table, entityId: b.id });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Restore failed." }, { status: 500 }); }
}
