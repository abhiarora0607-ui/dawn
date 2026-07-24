import { H } from "@/lib/http";
// lib/rate-limit.ts
// Serverless-safe rate limiting backed by a Supabase table. Every failed
// attempt writes a row; too many recent rows for one identifier blocks the
// action for a cooling-off window. Successful auth clears the counter.


const MAX_ATTEMPTS = 5;
const WINDOW_MIN = 15;

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
}

/** True if this identifier is currently blocked. */
export async function isRateLimited(url: string, key: string, identifier: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
    const res = await fetch(
      `${url}/rest/v1/login_attempts?identifier=eq.${encodeURIComponent(identifier)}&created_at=gte.${since}&select=id`,
      { headers: H(key, { Prefer: "count=exact" }), cache: "no-store" }
    );
    const count = Number(res.headers.get("content-range")?.split("/")[1] || 0);
    return count >= MAX_ATTEMPTS;
  } catch { return false; } // fail-open: an outage shouldn't lock everyone out
}

export async function recordFailedAttempt(url: string, key: string, identifier: string): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/login_attempts`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ identifier }),
    });
  } catch { /* best-effort */ }
}

export async function clearAttempts(url: string, key: string, identifier: string): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/login_attempts?identifier=eq.${encodeURIComponent(identifier)}`, {
      method: "DELETE", headers: H(key),
    });
  } catch { /* best-effort */ }
}

export const RATE_LIMIT_MESSAGE = `Too many attempts. Try again in ${WINDOW_MIN} minutes.`;
