import { H } from "@/lib/http";
// lib/soft-delete.ts
// One place for delete/restore so every route behaves identically. Soft-delete
// stamps deleted_at; restore clears it; purge removes rows past the recovery
// window for good. All operations are uid-scoped by the caller.


const RECOVERY_DAYS = 30;

export async function softDelete(url: string, key: string, table: string, id: string, uid: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key),
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    });
    return res.ok;
  } catch { return false; }
}

export async function restore(url: string, key: string, table: string, id: string, uid: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/${table}?id=eq.${id}&uid=eq.${uid}`, {
      method: "PATCH", headers: H(key),
      body: JSON.stringify({ deleted_at: null }),
    });
    return res.ok;
  } catch { return false; }
}

// Permanently remove rows deleted more than RECOVERY_DAYS ago. Called by cron.
export async function purgeExpired(url: string, key: string, table: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RECOVERY_DAYS * 86400000).toISOString();
    await fetch(`${url}/rest/v1/${table}?deleted_at=lt.${cutoff}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
  } catch { /* best-effort */ }
}

export const RECOVERY_WINDOW_DAYS = RECOVERY_DAYS;
