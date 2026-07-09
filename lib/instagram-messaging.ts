// lib/instagram-messaging.ts
// Real Instagram Graph API messaging. This is fully wired — it will send and
// receive live messages the moment Meta App Review grants the
// `instagram_manage_messages` permission. Until then, Instagram returns a
// permission error, which we surface honestly rather than fake success.

const GRAPH = "https://graph.instagram.com/v21.0";

// Look up the owner's Instagram access token for a given business uid.
async function getOwnerToken(uid: string): Promise<{ token: string; igUserId: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    // uid may be ig_<igUserId> or u_<...>. IG connection is keyed by ig_user_id.
    // For ig_ uids the account maps directly; for magic-link uids we look up
    // the linked IG connection by owner uid if present.
    const igId = uid.startsWith("ig_") ? uid.slice(3) : null;
    const q = igId
      ? `ig_connections?ig_user_id=eq.${igId}&select=access_token,ig_user_id&limit=1`
      : `ig_connections?owner_uid=eq.${uid}&select=access_token,ig_user_id&limit=1`;
    const rows = await (await fetch(`${url}/rest/v1/${q}`, { headers: H, cache: "no-store" })).json();
    const row = rows?.[0];
    if (!row?.access_token) return null;
    return { token: row.access_token, igUserId: row.ig_user_id };
  } catch { return null; }
}

export type SendResult = { ok: true; externalId?: string } | { ok: false; error: string; gated?: boolean };

// Send a message to a customer via Instagram. Returns a structured result.
export async function sendInstagramMessage(uid: string, recipientId: string, text: string): Promise<SendResult> {
  const auth = await getOwnerToken(uid);
  if (!auth) return { ok: false, error: "Instagram isn't connected for this business.", gated: false };

  try {
    const res = await fetch(`${GRAPH}/${auth.igUserId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    });
    const data = await res.json();
    if (res.ok) return { ok: true, externalId: data?.message_id };

    // Permission errors before App Review are expected — flag them clearly.
    const msg = data?.error?.message || "Instagram rejected the message.";
    const gated = /permission|scope|not approved|OAuth/i.test(msg);
    return { ok: false, error: gated ? "Instagram messaging is pending Meta approval." : msg, gated };
  } catch {
    return { ok: false, error: "Couldn't reach Instagram." };
  }
}
