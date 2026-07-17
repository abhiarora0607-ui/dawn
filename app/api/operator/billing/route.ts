// app/api/operator/billing/route.ts
// The revenue console's data + the operator's per-business billing actions
// (extend trial, mark complimentary, change plan, cancel). Operator-only.
// PRIVACY WALL unchanged: money and plan metadata only — never customer content.

import { NextResponse } from "next/server";
import { isOperator } from "@/lib/operator-auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
const DAY = 86400000;

export async function GET() {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const [subs, plans, payments, settings, cfgRows, gateEvents, feedbackRows] = await Promise.all([
      fetch(`${url}/rest/v1/subscriptions?select=*`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/plans?order=sort_order.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/payments?order=created_at.desc&limit=500`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/business_settings?select=uid,business_name`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/app_config?key=eq.billing&select=value&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/events?kind=eq.gate_hit&created_at=gte.${new Date(Date.now() - 30 * 86400000).toISOString()}&select=meta&limit=2000`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch(`${url}/rest/v1/feedback?order=created_at.desc&limit=20`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    const S: any[] = Array.isArray(subs) ? subs : [];
    const P: any[] = Array.isArray(payments) ? payments : [];
    const planById: Record<string, any> = {};
    for (const p of Array.isArray(plans) ? plans : []) planById[p.id] = p;
    const nameByUid: Record<string, string> = {};
    for (const s of Array.isArray(settings) ? settings : []) nameByUid[s.uid] = s.business_name;
    const cfg = (Array.isArray(cfgRows) && cfgRows[0]?.value) || {};

    const now = Date.now();
    const monthlyOf = (s: any) => {
      const price = s.price_locked != null ? Number(s.price_locked) : Number(s.billing_cycle === "yearly" ? planById[s.plan_id]?.price_yearly : planById[s.plan_id]?.price_monthly) || 0;
      return s.billing_cycle === "yearly" ? price / 12 : price;
    };

    const active = S.filter((s) => (s.status === "active" || s.status === "cancelled") && s.period_end && new Date(s.period_end).getTime() > now);
    const trialing = S.filter((s) => s.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now);
    const comp = S.filter((s) => s.status === "complimentary");
    const lapsedTrials = S.filter((s) => s.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() <= now);
    const paidUids = new Set(P.filter((p) => p.status === "succeeded").map((p) => p.uid));
    const lifetimeByUid: Record<string, number> = {};
    for (const p of P) if (p.status === "succeeded") lifetimeByUid[p.uid] = (lifetimeByUid[p.uid] || 0) + Number(p.amount || 0);
    const paidUidsByPlan: Record<string, Set<string>> = {};
    for (const p of P) if (p.status === "succeeded" && p.plan_id) (paidUidsByPlan[p.plan_id] = paidUidsByPlan[p.plan_id] || new Set()).add(p.uid);

    const mrr = Math.round(active.reduce((a, s) => a + monthlyOf(s), 0));
    const totalRevenue = Math.round(P.filter((p) => p.status === "succeeded").reduce((a, p) => a + Number(p.amount || 0), 0));
    const startedTrialEver = S.filter((s) => s.status !== "complimentary").length;
    const conversion = startedTrialEver > 0 ? Math.round((paidUids.size / startedTrialEver) * 100) : 0;
    const cancelled = S.filter((s) => s.cancel_at_period_end || s.status === "cancelled").length;

    // 8-week revenue trend + simple projection.
    const weeks = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const p of P) {
      if (p.status !== "succeeded") continue;
      const w = Math.floor((now - new Date(p.created_at).getTime()) / (7 * DAY));
      if (w >= 0 && w <= 7) weeks[7 - w] += Number(p.amount || 0);
    }
    const recent4 = weeks.slice(4).reduce((a, b) => a + b, 0), prior4 = weeks.slice(0, 4).reduce((a, b) => a + b, 0);
    const growthPct = prior4 > 0 ? Math.round(((recent4 - prior4) / prior4) * 100) : null;

    const byPlan = (Array.isArray(plans) ? plans : []).map((pl: any) => ({
      id: pl.id, name: pl.name,
      active: active.filter((s) => s.plan_id === pl.id).length,
      trialing: trialing.filter((s) => s.plan_id === pl.id).length,
      paidEver: paidUidsByPlan[pl.id]?.size || 0,
    }));

    // Renewals due within 7 days — the "collect the money" list.
    const renewalsSoon = active
      .map((s) => ({ uid: s.uid, name: nameByUid[s.uid] || null, planName: planById[s.plan_id]?.name || "—", daysLeft: Math.ceil((new Date(s.period_end).getTime() - now) / DAY), cancelAtPeriodEnd: !!s.cancel_at_period_end }))
      .filter((r) => r.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Churn + pricing research.
    const cancelReasons: Record<string, number> = {};
    for (const sRow of S) if (sRow.cancel_reason) cancelReasons[sRow.cancel_reason] = (cancelReasons[sRow.cancel_reason] || 0) + 1;
    const gateHits: Record<string, number> = {};
    for (const ev of Array.isArray(gateEvents) ? gateEvents : []) { const a = ev?.meta?.area || "unknown"; gateHits[a] = (gateHits[a] || 0) + 1; }
    const feedback = (Array.isArray(feedbackRows) ? feedbackRows : []).map((f: any) => ({ id: f.id, uid: f.uid, name: nameByUid[f.uid] || null, mood: f.mood, note: f.note, at: f.created_at }));

    const expiringSoon = trialing
      .map((s) => ({ uid: s.uid, name: nameByUid[s.uid] || null, daysLeft: Math.ceil((new Date(s.trial_ends_at).getTime() - now) / DAY) }))
      .filter((t) => t.daysLeft <= 7)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const subsOut = S.map((s) => {
      const startedAt = s.created_at || s.period_start || null;
      const endTs = s.status === "trialing" ? (s.trial_ends_at ? new Date(s.trial_ends_at).getTime() : null) : (s.period_end ? new Date(s.period_end).getTime() : null);
      return {
        uid: s.uid, name: nameByUid[s.uid] || null, status: s.status, cycle: s.billing_cycle,
        planName: planById[s.plan_id]?.name || "—", trialEndsAt: s.trial_ends_at, periodEnd: s.period_end,
        priceLocked: s.price_locked, cancelAtPeriodEnd: !!s.cancel_at_period_end, hasPaid: paidUids.has(s.uid),
        startedAt, daysUsed: startedAt ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / DAY)) : null,
        daysLeft: endTs ? Math.ceil((endTs - now) / DAY) : null,
        lifetimePaid: lifetimeByUid[s.uid] || 0,
      };
    });

    return NextResponse.json({
      testMode: cfg.test_mode !== false,
      metrics: { mrr, arr: mrr * 12, totalRevenue, arpu: active.length ? Math.round(mrr / active.length) : 0, paying: active.length, trialing: trialing.length, complimentary: comp.length, lapsedTrials: lapsedTrials.length, conversion, cancelled, growthPct },
      weeks, byPlan, expiringSoon, renewalsSoon, cancelReasons, gateHits, feedback,
      billingSettings: { default_trial_days: Number(cfg.default_trial_days ?? 14), grace_days: Number(cfg.grace_days ?? 3) },
      subs: subsOut,
      ledger: P.slice(0, 100).map((p) => ({ id: p.id, uid: p.uid, name: nameByUid[p.uid] || null, planName: p.plan_name, amount: Number(p.amount || 0), cycle: p.billing_cycle, status: p.status, gateway: p.gateway, reference: p.reference, at: p.created_at })),
    });
  } catch { return NextResponse.json({ error: "Couldn't load." }, { status: 500 }); }
}

export async function POST(req: Request) {
  if (!(await isOperator())) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const { url, key } = sb();
  try {
    const b = await req.json();
    if (!b.action || (!b.uid && b.action !== "update_settings")) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const patch: any = { updated_at: new Date().toISOString() };

    if (b.action === "extend_trial") {
      const days = Math.min(90, Math.max(1, Number(b.days) || 7));
      const cur = await fetch(`${url}/rest/v1/subscriptions?uid=eq.${b.uid}&select=trial_ends_at&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
      const base = Math.max(Date.now(), cur?.[0]?.trial_ends_at ? new Date(cur[0].trial_ends_at).getTime() : Date.now());
      patch.status = "trialing";
      patch.trial_ends_at = new Date(base + days * DAY).toISOString();
    } else if (b.action === "complimentary") {
      patch.status = "complimentary";
    } else if (b.action === "change_plan") {
      if (!b.planId) return NextResponse.json({ error: "Missing plan." }, { status: 400 });
      patch.plan_id = b.planId;
    } else if (b.action === "cancel") {
      patch.status = "cancelled"; patch.cancel_at_period_end = true;
    } else if (b.action === "update_settings") {
      // Global billing settings: trial length + grace, applied to every new trial.
      const cur = await fetch(`${url}/rest/v1/app_config?key=eq.billing&select=value&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const cfg = (Array.isArray(cur) && cur[0]?.value) || {};
      const value = {
        ...cfg,
        default_trial_days: Math.min(365, Math.max(1, Number(b.default_trial_days) || cfg.default_trial_days || 14)),
        grace_days: Math.min(30, Math.max(0, Number(b.grace_days ?? cfg.grace_days ?? 3))),
      };
      await fetch(`${url}/rest/v1/app_config`, {
        method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify({ key: "billing", value, updated_at: new Date().toISOString() }),
      });
      await audit({ uid: "operator", action: "operator.billing.update_settings", entity: "app_config", entityId: "billing", meta: value });
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    // Upsert so the action works even before the business's first entitlement check.
    await fetch(`${url}/rest/v1/subscriptions`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ uid: b.uid, ...patch }),
    });
    await audit({ uid: b.uid, action: `operator.billing.${b.action}`, entity: "subscriptions", entityId: b.uid, meta: { by: "operator", days: b.days, planId: b.planId } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Action failed." }, { status: 500 }); }
}
