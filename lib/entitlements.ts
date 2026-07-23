// lib/entitlements.ts
// The single source of billing truth. Every API that gates a feature asks this
// one question: getEntitlements(uid) → what can this business do?
//
// Design rules:
// - FAIL OPEN. If billing tables are unreachable or missing, the answer is
//   "full access". Billing must never take the product down.
// - READS NEVER WRITE (V56). The one write this file may ever make is the
//   first-sighting trial insert — and only when the subscriptions read came
//   back HTTP-ok AND an empty array: a confirmed absence. An error body, a
//   rate limit, a pooler blip: fail open, write nothing. The insert itself
//   uses ignore-duplicates, so even a race can never overwrite an existing
//   row. (The pre-V56 bug: an error-shaped read looked like "no row", and a
//   merge-duplicates upsert silently reset real subscriptions to trial.)
// - Effective status is COMPUTED from dates, not trusted from the stored
//   status column — no cron dependency for expiry.

import { audit } from "@/lib/audit";

function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

const TRIAL_PLAN_ID = "00000000-0000-0000-0000-000000000003"; // Pro — trials taste everything
const DAY = 86400000;

export type Entitlements = {
  status: string;            // stored status
  effective: string;         // trialing | active | grace | expired | complimentary
  canWrite: boolean;         // false only when expired (read-only lock)
  planId: string | null;
  planName: string;
  features: Record<string, boolean>;
  maxSeats: number | null;   // null = unlimited
  trialEndsAt: string | null;
  daysLeft: number | null;   // days of trial (or grace) remaining
  cycle: string;
  periodEnd: string | null;
  priceLocked: number | null;
  cancelAtPeriodEnd: boolean;
  testMode: boolean;
  trialStartedAt: string | null;
  renewsInDays: number | null;   // days until period_end while active
};

const OPEN: Entitlements = {
  status: "unknown", effective: "active", canWrite: true, planId: null, planName: "—",
  features: { crm: true, instagram_ai: true },
  maxSeats: null, trialEndsAt: null, daysLeft: null, cycle: "monthly", periodEnd: null,
  priceLocked: null, cancelAtPeriodEnd: false, testMode: true,
  trialStartedAt: null, renewsInDays: null,
};

// ---------------------------------------------------------------- PURE CORE
// The subscription state machine, extracted (V56) so every boundary can be
// rule-tested. Semantics are FROZEN from V55 — including two documented
// quirks kept deliberately until V58 revisits them with history in place:
// an active/cancelled row with NO period_end computes as expired (both
// branches require the date), and an unrecognized status string falls
// through as "active".
export type SubLike = {
  status?: string | null;
  trial_ends_at?: string | null;
  period_end?: string | null;
} | null;

export function computeEffective(
  sub: SubLike, graceDays: number, trialDays: number, now: number,
): { effective: string; daysLeft: number | null } {
  if (!sub) return { effective: "none", daysLeft: null };
  let effective = "active";
  let daysLeft: number | null = null;

  if (sub.status === "complimentary") {
    effective = "complimentary";
  } else if (sub.status === "trialing") {
    const ends = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : now + trialDays * DAY;
    if (now <= ends) { effective = "trialing"; daysLeft = Math.max(0, Math.ceil((ends - now) / DAY)); }
    else if (now <= ends + graceDays * DAY) { effective = "grace"; daysLeft = Math.max(0, Math.ceil((ends + graceDays * DAY - now) / DAY)); }
    else effective = "expired";
  } else if (sub.status === "active" || sub.status === "cancelled") {
    const pe = sub.period_end ? new Date(sub.period_end).getTime() : 0;
    if (pe && now <= pe) effective = "active";
    else if (pe && now <= pe + graceDays * DAY) { effective = "grace"; daysLeft = Math.max(0, Math.ceil((pe + graceDays * DAY - now) / DAY)); }
    else effective = "expired";
  } else if (sub.status === "past_due") {
    effective = "expired";
  }
  return { effective, daysLeft };
}

// Area access for a computed state. Trials and complimentary taste everything.
// Legacy tier plans (pre-V26) never had a "crm" key — CRM was ungated then,
// so legacy subscribers keep it (grandfathering); their old "ai" flag maps to
// the Instagram & AI area.
export function areasFor(
  effective: string, features: Record<string, any> | null | undefined,
): { crm: boolean; instagram_ai: boolean } {
  if (effective === "trialing" || effective === "complimentary") return { crm: true, instagram_ai: true };
  return {
    crm: features?.crm !== undefined ? !!features.crm : true,
    instagram_ai: features?.instagram_ai !== undefined ? !!features.instagram_ai : !!features?.ai,
  };
}

// ------------------------------------------------------------------ NETWORK
export async function getEntitlements(url: string, key: string, uid: string): Promise<Entitlements> {
  try {
    const [subRes, cfgRows] = await Promise.all([
      fetch(`${url}/rest/v1/subscriptions?uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" })
        .then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => null) }))
        .catch(() => ({ ok: false, body: null as any })),
      fetch(`${url}/rest/v1/app_config?key=eq.billing&select=value&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const cfg = (Array.isArray(cfgRows) && cfgRows[0]?.value) || {};
    const graceDays = Number(cfg.grace_days ?? 3);
    const trialDays = Number(cfg.default_trial_days ?? 14);
    const testMode = cfg.test_mode !== false;

    // V56: a read that didn't come back clean proves nothing — fail open and,
    // above all, WRITE NOTHING. Only an HTTP-ok empty array is an absence.
    const subReadOk = subRes.ok && Array.isArray(subRes.body);
    if (!subReadOk) return OPEN;

    let sub = subRes.body[0] ?? null;
    if (!sub) {
      // Confirmed first sighting of this business → start its trial. The
      // ignore-duplicates resolution means a race can only no-op, never
      // overwrite — and the birth is audit-logged, so no subscription row
      // ever again appears "from nowhere".
      sub = {
        uid, plan_id: TRIAL_PLAN_ID, status: "trialing", billing_cycle: "monthly",
        trial_ends_at: new Date(Date.now() + trialDays * DAY).toISOString(),
        period_start: new Date().toISOString(),
      };
      await fetch(`${url}/rest/v1/subscriptions`, {
        method: "POST", headers: H(key, { Prefer: "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify(sub),
      }).catch(() => {});
      audit({
        uid, actor: "system", actorType: "system", action: "billing.trial_started",
        entity: "subscriptions", entityId: uid,
        meta: { plan_id: TRIAL_PLAN_ID, trial_ends_at: sub.trial_ends_at },
      }).catch(() => {});
    }

    const planRows = sub.plan_id
      ? await fetch(`${url}/rest/v1/plans?id=eq.${sub.plan_id}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
      : [];
    const plan = (Array.isArray(planRows) && planRows[0]) || null;

    const now = Date.now();
    const { effective, daysLeft } = computeEffective(sub, graceDays, trialDays, now);

    return {
      status: sub.status,
      effective,
      canWrite: effective !== "expired",
      planId: sub.plan_id || null,
      planName: plan?.name || "Trial",
      features: areasFor(effective, plan?.features),
      maxSeats: effective === "trialing" || effective === "complimentary" ? null : plan?.max_seats ?? null,
      trialEndsAt: sub.trial_ends_at || null,
      daysLeft,
      cycle: sub.billing_cycle || "monthly",
      periodEnd: sub.period_end || null,
      priceLocked: sub.price_locked != null ? Number(sub.price_locked) : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      testMode,
      trialStartedAt: sub.created_at || sub.period_start || null,
      renewsInDays: effective === "active" && sub.period_end ? Math.max(0, Math.ceil((new Date(sub.period_end).getTime() - now) / DAY)) : null,
    };
  } catch {
    return OPEN; // billing down ≠ product down
  }
}

// One-line write guard for APIs: returns an error body when the business is
// read-only (expired), or null when the write may proceed.
export async function writeBlocked(url: string, key: string, uid: string): Promise<{ error: string } | null> {
  const e = await getEntitlements(url, key, uid);
  if (e.canWrite) return null;
  return { error: "Your trial has ended. Your data is safe and exportable — upgrade in Settings → Billing to continue adding to it." };
}

// The V26 gate: one call guards a whole API for an area. Blocks when the
// business is past its wall (trial/subscription expired → hard paywall) or
// didn't buy this half of Dawn. Area denials are logged as gate_hit events —
// that's live pricing research (which package people reach for).
export async function requireArea(url: string, key: string, uid: string, area: "crm" | "instagram_ai"): Promise<{ error: string; locked: string } | null> {
  const e = await getEntitlements(url, key, uid);
  if (!e.canWrite) {
    return { error: "Your trial or subscription has ended. Your data is safe — choose a plan in Billing to continue.", locked: "expired" };
  }
  if (!e.features[area]) {
    // fire-and-forget analytics; never blocks the response
    fetch(`${url}/rest/v1/events`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({ uid, kind: "gate_hit", meta: { area } }),
    }).catch(() => {});
    const label = area === "crm" ? "CRM & Business" : "Instagram & AI";
    return { error: `This is part of the ${label} plan — upgrade in Settings → Billing to unlock it.`, locked: area };
  }
  return null;
}
