// app/api/billing/route.ts
// The owner's billing surface. GET returns their subscription state, the plan
// catalogue and payment history. POST handles checkout (MOCK gateway for now —
// always succeeds, clearly recorded as gateway:'mock'), cancel and resume.
// All uid-scoped. The mock is a seam: when Razorpay arrives, only the payment
// step changes; subscription activation stays identical.

import { NextResponse } from "next/server";
import { getUid } from "@/lib/auth";
import { getEntitlements } from "@/lib/entitlements";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
function H(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}
const MONTH = 30 * 86400000, YEAR = 365 * 86400000;

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const [ent, plans, payments] = await Promise.all([
      getEntitlements(url, key, uid),
      fetch(`${url}/rest/v1/plans?is_active=eq.true&order=sort_order.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/payments?uid=eq.${uid}&order=created_at.desc&limit=24`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
    ]);
    return NextResponse.json({ ent, plans: Array.isArray(plans) ? plans : [], payments: Array.isArray(payments) ? payments : [] });
  } catch { return NextResponse.json({ error: "Couldn't load billing." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const b = await req.json();

    // ---- cancel at period end / resume --------------------------------
    if (b.action === "cancel" || b.action === "resume") {
      const patch: any = { cancel_at_period_end: b.action === "cancel", status: b.action === "cancel" ? "cancelled" : "active", updated_at: new Date().toISOString() };
      if (b.action === "cancel") patch.cancel_reason = String(b.reason || "").slice(0, 200) || null;
      await fetch(`${url}/rest/v1/subscriptions?uid=eq.${uid}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify(patch),
      });
      if (b.action === "cancel") {
        // churn research from day one
        fetch(`${url}/rest/v1/events`, { method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ uid, kind: "cancel", meta: { reason: patch.cancel_reason } }) }).catch(() => {});
      }
      await audit({ uid, action: `billing.${b.action}`, entity: "subscriptions", entityId: uid, meta: { reason: b.reason } });
      return NextResponse.json({ ok: true });
    }

    // ---- checkout (MOCK: always succeeds) -----------------------------
    const cycle = b.cycle === "yearly" ? "yearly" : "monthly";
    const planRows = await fetch(`${url}/rest/v1/plans?id=eq.${b.planId}&is_active=eq.true&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const plan = Array.isArray(planRows) ? planRows[0] : null;
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 400 });

    const amount = Number(cycle === "yearly" ? plan.price_yearly : plan.price_monthly) || 0;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + (cycle === "yearly" ? YEAR : MONTH));
    const reference = `MOCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Record the payment (gateway: mock — visibly test money).
    await fetch(`${url}/rest/v1/payments`, {
      method: "POST", headers: H(key, { Prefer: "return=minimal" }),
      body: JSON.stringify({
        uid, plan_id: plan.id, plan_name: plan.name, amount, currency: "₹",
        billing_cycle: cycle, period_start: now.toISOString(), period_end: periodEnd.toISOString(),
        status: "succeeded", gateway: "mock", reference,
      }),
    });

    // Activate the subscription — price locked at what they paid.
    await fetch(`${url}/rest/v1/subscriptions`, {
      method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        uid, plan_id: plan.id, status: "active", billing_cycle: cycle,
        period_start: now.toISOString(), period_end: periodEnd.toISOString(),
        price_locked: amount, cancel_at_period_end: false, updated_at: now.toISOString(),
      }),
    });

    await audit({ uid, action: "billing.payment", entity: "payments", entityId: reference, meta: { plan: plan.name, amount, cycle, gateway: "mock" } });
    return NextResponse.json({ ok: true, reference, amount, planName: plan.name, periodEnd: periodEnd.toISOString() });
  } catch { return NextResponse.json({ error: "Payment failed." }, { status: 500 }); }
}
