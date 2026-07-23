// app/api/team/messages/route.ts
// Employee messaging. Conversations are scoped to the employee (only their
// assigned customers' threads). Sending goes through Instagram (live after
// Meta review; honest "pending approval" state until then).

import { NextResponse } from "next/server";
import { guardEmployee, empHeaders } from "@/lib/employee-auth";
import { sendInstagramMessage } from "@/lib/instagram-messaging";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET ?conversationId=... → messages in a thread
// GET (no param) → list of the employee's conversations
export async function GET(req: Request) {
  const g = await guardEmployee("messaging");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  const convId = new URL(req.url).searchParams.get("conversationId");

  try {
    if (convId) {
      // Verify the conversation is the employee's
      const conv = (await (await fetch(`${url}/rest/v1/conversations?id=eq.${convId}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
      if (!conv) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const msgs = await (await fetch(`${url}/rest/v1/messages?conversation_id=eq.${convId}&order=created_at.asc&limit=500`, { headers: empHeaders(key), cache: "no-store" })).json();
      // Clear unread
      await fetch(`${url}/rest/v1/conversations?id=eq.${convId}`, { method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }), body: JSON.stringify({ unread_count: 0 }) });
      return NextResponse.json({ conversation: conv, messages: Array.isArray(msgs) ? msgs : [] });
    }
    const convs = await (await fetch(`${url}/rest/v1/conversations?uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&order=last_message_at.desc.nullslast`, { headers: empHeaders(key), cache: "no-store" })).json();
    return NextResponse.json({ conversations: Array.isArray(convs) ? convs : [] });
  } catch { return NextResponse.json({ conversations: [] }); }
}

// POST → send a message in a conversation
export async function POST(req: Request) {
  const g = await guardEmployee("messaging");
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const { ctx, url, key } = g;
  try {
    const b = await req.json();
    if (!b.conversationId || !b.text?.trim()) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });

    const conv = (await (await fetch(`${url}/rest/v1/conversations?id=eq.${b.conversationId}&uid=eq.${ctx.uid}&employee_id=eq.${ctx.employeeId}&select=*&limit=1`, { headers: empHeaders(key), cache: "no-store" })).json())?.[0];
    if (!conv) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Attempt real Instagram send.
    const send = await sendInstagramMessage(ctx.uid, conv.external_id, b.text.trim());

    // Record the outbound message regardless (marked delivered only if IG accepted).
    await fetch(`${url}/rest/v1/messages`, {
      method: "POST", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid: ctx.uid, conversation_id: b.conversationId, direction: "out", body: b.text.trim(),
        sender: ctx.employeeId, delivered: send.ok, external_message_id: send.ok ? (send as any).externalId : null,
      }),
    });
    await fetch(`${url}/rest/v1/conversations?id=eq.${b.conversationId}`, {
      method: "PATCH", headers: empHeaders(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ last_message_at: new Date().toISOString(), last_message_preview: b.text.trim().slice(0, 80) }),
    });
    await audit({ uid: ctx.uid, actor: ctx.employeeId, actorType: "employee", action: "message.send", entity: "conversations", entityId: b.conversationId });

    if (!send.ok) {
      // Saved locally, but delivery is gated/failed — tell the truth.
      return NextResponse.json({ ok: true, delivered: false, note: send.error, gated: (send as any).gated || false });
    }
    return NextResponse.json({ ok: true, delivered: true });
  } catch { return NextResponse.json({ error: "Send failed." }, { status: 500 }); }
}
