// app/api/operator/plans/route.ts
// The pricing cockpit: create, edit and archive plans. Operator-only.
// Editing a plan never touches existing subscribers — their price is locked
// on the subscription row (grandfathering by design).

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const FIELDS = ["name", "tagline", "price_monthly", "price_yearly", "trial_days", "features", "max_seats", "max_contacts", "sort_order", "is_active"];

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  const plans = await fetch(`${url}/rest/v1/plans?order=sort_order.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
  return NextResponse.json({ plans: Array.isArray(plans) ? plans : [] });
}

export async function POST(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    const row: any = {};
    for (const f of FIELDS) if (b[f] !== undefined) row[f] = b[f];
    if (!row.name) return NextResponse.json({ error: "Name required." }, { status: 400 });
    const res = await fetch(`${url}/rest/v1/plans`, { method: "POST", headers: H(key, { Prefer: "return=representation" }), body: JSON.stringify(row) });
    const rows = await res.json();
    return NextResponse.json({ ok: res.ok, plan: rows?.[0] || null });
  } catch { return NextResponse.json({ error: "Save failed." }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
    const row: any = {};
    for (const f of FIELDS) if (b[f] !== undefined) row[f] = b[f];
    await fetch(`${url}/rest/v1/plans?id=eq.${b.id}`, { method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify(row) });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Save failed." }, { status: 400 }); }
}
