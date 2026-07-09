// lib/audit.ts
// Lightweight audit logging. Records important actions for security review
// and the upcoming employee portal. Fire-and-forget — never blocks the
// request or throws into the caller.

import { sbHeaders } from "@/lib/tenant";

export type AuditEntry = {
  uid: string;
  actor?: string;
  actorType?: "owner" | "employee" | "system";
  action: string;        // e.g. "contact.delete"
  entity?: string;
  entityId?: string;
  meta?: Record<string, any>;
  ip?: string | null;
};

export async function audit(entry: AuditEntry): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/audit_log`, {
      method: "POST",
      headers: sbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid: entry.uid,
        actor: entry.actor || entry.uid,
        actor_type: entry.actorType || "owner",
        action: entry.action,
        entity: entry.entity || null,
        entity_id: entry.entityId || null,
        meta: entry.meta || {},
        ip: entry.ip || null,
      }),
    });
  } catch {
    // Auditing must never break the actual operation.
  }
}
