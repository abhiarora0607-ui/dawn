// lib/billing-events.ts
// The single doorway to subscription history (V58). Every write to the
// subscriptions table — owner action, operator override, cron application,
// or the system's own trial creation — records an event here. Invariant 32
// enforces the pairing structurally: a file that writes subscriptions must
// call recordSubEvent. Best-effort at runtime (history must never block the
// operation it describes), mandatory in code.

export type SubEvent = {
  uid: string;
  actor: "owner" | "operator" | "cron" | "system";
  action: string;
  fromPlanId?: string | null;
  toPlanId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  cycle?: string | null;
  reason?: string | null;
  meta?: Record<string, any>;
};

export async function recordSubEvent(url: string, key: string, e: SubEvent): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/subscription_events`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        uid: e.uid, actor: e.actor, action: e.action,
        from_plan_id: e.fromPlanId || null, to_plan_id: e.toPlanId || null,
        from_status: e.fromStatus || null, to_status: e.toStatus || null,
        cycle: e.cycle || null, reason: e.reason || null, meta: e.meta || null,
      }),
    });
  } catch { /* history is best-effort; the operation itself already succeeded */ }
}
