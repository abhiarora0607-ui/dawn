// app/api/operator/business/route.ts
// One business's usage story for the operator — the same privacy wall applies:
// counts, dates, and weekly activity SHAPE only. Never a row of their content.
// Also serves the operator's private notes (GET) and creates them (POST).

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
const DAY = 86400000, WEEK = 7 * DAY;

export async function GET(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  const uid = new URL(req.url).searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "Missing business." }, { status: 400 });

  try {
    const [user, settings, ig, contacts, sales, employees, tasks, activities, notes] = await Promise.all([
      fetch(`${url}/rest/v1/dawn_users?uid=eq.${encodeURIComponent(uid)}&select=uid,email,created_at,last_active_at&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/business_settings?uid=eq.${encodeURIComponent(uid)}&select=business_name,phone,whatsapp,business_type,currency&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/ig_connections?owner_uid=eq.${encodeURIComponent(uid)}&select=ig_user_id,connected_at,access_token`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/contacts?uid=eq.${encodeURIComponent(uid)}&select=uid,is_demo,created_at`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/sales?uid=eq.${encodeURIComponent(uid)}&select=uid,is_demo,date`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/employees?uid=eq.${encodeURIComponent(uid)}&select=uid,is_demo,is_owner`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/tasks?uid=eq.${encodeURIComponent(uid)}&select=uid,is_demo`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/activities?uid=eq.${encodeURIComponent(uid)}&select=created_at&order=created_at.desc&limit=2000`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/operator_notes?target_uid=eq.${encodeURIComponent(uid)}&select=*&order=created_at.desc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);

    const real = (rows: any[], extra?: (r: any) => boolean) => (Array.isArray(rows) ? rows : []).filter((r) => r.is_demo !== true && (!extra || extra(r)));
    const u = user?.[0]; const st = settings?.[0];
    const igs = Array.isArray(ig) ? ig : [];

    // 12-week activity shape.
    const now = Date.now();
    const weeks = new Array(12).fill(0);
    for (const a of Array.isArray(activities) ? activities : []) {
      const w = Math.floor((now - new Date(a.created_at).getTime()) / WEEK);
      if (w >= 0 && w < 12) weeks[11 - w]++;
    }

    return NextResponse.json({
      uid,
      name: st?.business_name || null,
      email: u?.email || null,
      phone: st?.phone || null,
      whatsapp: st?.whatsapp || st?.phone || null,
      businessType: st?.business_type || null,
      signedUp: u?.created_at || null,
      lastActive: u?.last_active_at || null,
      daysQuiet: u?.last_active_at ? Math.floor((now - new Date(u.last_active_at).getTime()) / DAY) : null,
      instagram: igs.map((g: any) => ({ connectedAt: g.connected_at, live: !!g.access_token })),
      counts: {
        contacts: real(contacts).length,
        orders: real(sales).length,
        employees: real(employees, (r) => r.is_owner !== true).length,
        tasks: real(tasks).length,
      },
      weeks,
      notes: Array.isArray(notes) ? notes : [],
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    const note = (b.note || "").trim();
    if (!b.uid || !note) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
    await fetch(`${url}/rest/v1/operator_notes`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ target_uid: b.uid, note: note.slice(0, 2000) }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Couldn't save." }, { status: 500 }); }
}

export async function DELETE(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await fetch(`${url}/rest/v1/operator_notes?id=eq.${id}`, { method: "DELETE", headers: H(key) });
  return NextResponse.json({ ok: true });
}
