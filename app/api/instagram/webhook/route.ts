// app/api/instagram/webhook/route.ts
// Receives Instagram messaging webhooks and syncs incoming DMs into the CRM
// as conversations + messages. Auto-links to an existing contact (and its
// assigned employee) when the sender matches; otherwise leaves it unassigned
// for the owner to route. Live after Meta App Review; harmless before it
// (no events arrive until then).

import { NextResponse } from "next/server";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY }; }

// Meta webhook verification handshake.
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge || "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const { url, key } = sb();
  if (!url || !key) return NextResponse.json({ ok: true }); // ack regardless
  try {
    const body = await req.json();
    // Instagram messaging payload shape: entry[].messaging[]
    for (const entry of body.entry || []) {
      const recipientIgId = entry.id; // the business IG account that received it
      for (const m of entry.messaging || []) {
        const senderId = m.sender?.id;
        const text = m.message?.text;
        const mid = m.message?.mid;
        if (!senderId || !text) continue;

        // Resolve the owner (business) by the IG account id.
        const conn = (await (await fetch(`${url}/rest/v1/ig_connections?ig_user_id=eq.${recipientIgId}&select=ig_user_id,owner_uid&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
        const uid = conn?.owner_uid || `ig_${recipientIgId}`;

        // Find or create the conversation for this sender.
        let conv = (await (await fetch(`${url}/rest/v1/conversations?uid=eq.${uid}&external_id=eq.${senderId}&select=*&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];

        if (!conv) {
          // Try to link an existing contact by instagram handle/sender id →
          // inherit its assigned employee.
          const contact = (await (await fetch(`${url}/rest/v1/contacts?uid=eq.${uid}&instagram_handle=eq.${senderId}&select=id,employee_id&limit=1`, { headers: H(key), cache: "no-store" })).json())?.[0];
          const created = await (await fetch(`${url}/rest/v1/conversations`, {
            method: "POST", headers: H(key, { Prefer: "return=representation" }),
            body: JSON.stringify({
              uid, contact_id: contact?.id || null, employee_id: contact?.employee_id || null,
              channel: "instagram", external_id: senderId, unread_count: 1,
              last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 80),
            }),
          })).json();
          conv = created?.[0];
        } else {
          await fetch(`${url}/rest/v1/conversations?id=eq.${conv.id}`, {
            method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify({ unread_count: (conv.unread_count || 0) + 1, last_message_at: new Date().toISOString(), last_message_preview: text.slice(0, 80) }),
          });
        }

        if (conv?.id) {
          await fetch(`${url}/rest/v1/messages`, {
            method: "POST", headers: H(key, { Prefer: "return=minimal" }),
            body: JSON.stringify({ uid, conversation_id: conv.id, direction: "in", body: text, sender: "customer", external_message_id: mid, delivered: true }),
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // always ack to Meta
  }
}
