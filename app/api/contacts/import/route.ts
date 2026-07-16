// app/api/contacts/import/route.ts
// Bulk contact import. Accepts parsed rows from a CSV, validates each with the
// same rules as single-add, skips duplicates (by phone) within THIS business,
// and assigns everything to the owner unless a row names an employee. All
// uid-scoped — an import can only ever write into the importer's own business.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { cleanName, cleanPhone, cleanEmail } from "@/lib/validate";
import { ensureOwnerEmployee } from "@/lib/owner-employee";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const VALID_STAGES = ["New Lead", "Contacted", "Negotiating", "Customer (Won)", "Lost"];
const MAX_ROWS = 500;

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!url || !key) return NextResponse.json({ error: "Not configured." }, { status: 500 });

  try {
    const b = await req.json();
    const rows: any[] = Array.isArray(b.rows) ? b.rows : [];
    if (rows.length === 0) return NextResponse.json({ error: "No rows to import." }, { status: 400 });
    if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows at once (max ${MAX_ROWS}). Split the file.` }, { status: 400 });

    const owner = await ensureOwnerEmployee(url, key, uid);

    // Existing phones in THIS business — for dedupe.
    const existing = await (await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&select=phone`, { headers: H(key), cache: "no-store" })).json();
    const seen = new Set((Array.isArray(existing) ? existing : []).map((c: any) => (c.phone || "").replace(/\D/g, "")).filter(Boolean));

    const toInsert: any[] = [];
    const errors: { row: number; reason: string }[] = [];
    let skipped = 0;

    rows.forEach((r, i) => {
      const nm = cleanName(r.name);
      if (!nm.ok) { errors.push({ row: i + 1, reason: nm.error || "bad name" }); return; }
      const ph = cleanPhone(r.phone || "");
      if (r.phone && !ph.ok) { errors.push({ row: i + 1, reason: ph.error || "bad phone" }); return; }
      const em = cleanEmail(r.email || "");
      if (r.email && !em.ok) { errors.push({ row: i + 1, reason: em.error || "bad email" }); return; }

      const digits = (ph.value || "").replace(/\D/g, "");
      if (digits && seen.has(digits)) { skipped++; return; } // duplicate in this business
      if (digits) seen.add(digits);

      const stage = VALID_STAGES.includes(r.stage) ? r.stage : "New Lead";
      toInsert.push({
        uid, name: nm.value, phone: ph.value || "", email: em.value || "",
        instagram_handle: (r.instagram || r.instagramHandle || "").replace("@", ""),
        source: r.source || "Import", stage, tags: [], interested_item_ids: [],
        notes: r.notes || "", employee_id: owner,
      });
    });

    let inserted = 0;
    if (toInsert.length > 0) {
      // Insert in chunks to stay well under any payload limits.
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const res = await fetch(`${url}/rest/v1/contacts`, {
          method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(chunk),
        });
        if (res.ok) inserted += chunk.length;
        else errors.push({ row: i + 1, reason: "batch save failed" });
      }
    }

    return NextResponse.json({ inserted, skipped, failed: errors.length, errors: errors.slice(0, 20) });
  } catch {
    return NextResponse.json({ error: "Couldn't process the file." }, { status: 400 });
  }
}
