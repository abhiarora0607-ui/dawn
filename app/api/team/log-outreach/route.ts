// app/api/team/log-outreach/route.ts
// When an employee taps WhatsApp/Call on a contact, we log it. Without this the
// activity trail has holes exactly where the real selling happens.

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guardEmployee("leads");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    const channel = b.channel === "call" ? "Called" : "Messaged on WhatsApp";
    if (!b.contactId) return NextResponse.json({ error: "Missing contact." }, { status: 400 });
    const owned = (await (await fetch(`${url}/rest/v1/contacts?id=eq.${b.contactId}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=id&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
    if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });
    await fetch(`${url}/rest/v1/activities`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid: ctx.uid, contact_id: b.contactId, type: "note", content: `${channel} by ${ctx.name || "employee"}` }),
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Failed." }, { status: 500 }); }
}
