// lib/entitlements.ts
// The single source of billing truth. Every API that gates a feature asks this
// one question: getEntitlements(uid) → what can this business do?
//
// Design rules:
// - FAIL OPEN. If billing tables are unreachable or missing, the answer is
//   "full access". Billing must never take the product down.
// - Lazy-create: a business with no subscription row gets a fresh trial on
//   first check — so new signups are covered without touching the identity
//   callback, whatever path they arrived by.
// - Effective status is COMPUTED from dates, not trusted from the stored
//   status column — no cron dependency for expiry.

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
};

const OPEN: Entitlements = {
  status: "unknown", effective: "active", canWrite: true, planId: null, planName: "—",
  features: { team: true, scoring: true, csv_import: true, ai: true, item_analytics: true },
  maxSeats: null, trialEndsAt: null, daysLeft: null, cycle: "monthly", periodEnd: null,
  priceLocked: null, cancelAtPeriodEnd: false, testMode: true,
};

export async function getEntitlements(url: string, key: string, uid: string): Promise<Entitlements> {
  try {
    let [subRows, cfgRows] = await Promise.all([
      fetch(`${url}/rest/v1/subscriptions?uid=eq.${uid}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/app_config?key=eq.billing&select=value&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const cfg = (Array.isArray(cfgRows) && cfgRows[0]?.value) || {};
    const graceDays = Number(cfg.grace_days ?? 3);
    const trialDays = Number(cfg.default_trial_days ?? 14);
    const testMode = cfg.test_mode !== false;

    let sub = Array.isArray(subRows) ? subRows[0] : null;
    if (!sub) {
      // First sighting of this business → start its trial.
      sub = { uid, plan_id: TRIAL_PLAN_ID, status: "trialing", billing_cycle: "monthly", trial_ends_at: new Date(Date.now() + trialDays * DAY).toISOString(), period_start: new Date().toISOString() };
      await fetch(`${url}/rest/v1/subscriptions`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(sub),
      }).catch(() => {});
    }

    const planRows = sub.plan_id
      ? await fetch(`${url}/rest/v1/plans?id=eq.${sub.plan_id}&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => [])
      : [];
    const plan = (Array.isArray(planRows) && planRows[0]) || null;

    const now = Date.now();
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

    return {
      status: sub.status,
      effective,
      canWrite: effective !== "expired",
      planId: sub.plan_id || null,
      planName: plan?.name || "Trial",
      features: { ...OPEN.features, ...(effective === "trialing" || effective === "complimentary" ? {} : plan?.features || {}) },
      maxSeats: effective === "trialing" || effective === "complimentary" ? null : plan?.max_seats ?? null,
      trialEndsAt: sub.trial_ends_at || null,
      daysLeft,
      cycle: sub.billing_cycle || "monthly",
      periodEnd: sub.period_end || null,
      priceLocked: sub.price_locked != null ? Number(sub.price_locked) : null,
      cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      testMode,
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
