// lib/touch.ts
// Best-effort "this business was just active" stamp. Called from a few
// high-traffic APIs; failures are swallowed — activity tracking must never
// break a real request.

export async function touchActive(url: string, key: string, uid: string): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/dawn_users?uid=eq.${uid}`, {
      method: "PATCH",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ last_active_at: new Date().toISOString() }),
    });
  } catch { /* never block the caller */ }
}
