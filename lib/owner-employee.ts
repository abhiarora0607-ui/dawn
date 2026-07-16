// lib/owner-employee.ts
// Every business has exactly one non-deletable "owner" employee record. It
// makes assignment universal: solo sellers assign to themselves, teams assign
// to real staff, and nothing is ever left unassigned.

function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** Returns the owner-employee id for this business, creating it if missing. */
export async function ensureOwnerEmployee(url: string, key: string, uid: string, name?: string): Promise<string | null> {
  try {
    const existing = await (await fetch(`${url}/rest/v1/employees?uid=eq.${uid}&is_owner=is.true&select=id&limit=1`, { headers: H(key), cache: "no-store" })).json();
    if (Array.isArray(existing) && existing[0]?.id) return existing[0].id;

    // Name it after the business if we know it, otherwise a sensible default.
    let label = name;
    if (!label) {
      const s = await (await fetch(`${url}/rest/v1/business_settings?uid=eq.${uid}&select=business_name&limit=1`, { headers: H(key), cache: "no-store" })).json();
      label = s?.[0]?.business_name || "Owner";
    }
    const res = await fetch(`${url}/rest/v1/employees`, {
      method: "POST", headers: H(key, { Prefer: "return=representation" }),
      body: JSON.stringify({ uid, name: `${label} (Owner)`, status: "active", is_owner: true, role: "Owner", monthly_salary: 0 }),
    });
    const row = (await res.json())?.[0];
    return row?.id || null;
  } catch { return null; }
}
