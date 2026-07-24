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
import { sendMail, shell, APP } from "@/lib/mailer";
import { recordSubEvent } from "@/lib/billing-events";
import { classifyChange } from "@/lib/billing-lifecycle";
import { activeAdapter, applySuccessfulPayment } from "@/lib/payments";
import { H } from "@/lib/http";

export const dynamic = "force-dynamic";
function sb() { return { url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.SUPABASE_SECRET_KEY! }; }
const MONTH = 30 * 86400000, YEAR = 365 * 86400000;

export async function GET() {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const [ent, plans, payments, events] = await Promise.all([
      getEntitlements(url, key, uid),
      fetch(`${url}/rest/v1/plans?is_active=eq.true&order=sort_order.asc`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/payments?uid=eq.${uid}&order=created_at.desc&limit=24`, { headers: H(key), cache: "no-store" }).then((r) => r.json()),
      fetch(`${url}/rest/v1/subscription_events?uid=eq.${uid}&order=at.desc&limit=20`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []),
    ]);
    return NextResponse.json({ ent, plans: Array.isArray(plans) ? plans : [], payments: Array.isArray(payments) ? payments : [], events: Array.isArray(events) ? events : [] });
  } catch { return NextResponse.json({ error: "Couldn't load billing." }, { status: 500 }); }
}

export async function POST(req: Request) {
  const uid = await getUid();
  const { url, key } = sb();
  if (!uid || !url || !key) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const b = await req.json();

    // ---- undo a scheduled plan change (V58) ---------------------------
    if (b.action === "undo_schedule") {
      await fetch(`${url}/rest/v1/subscriptions?uid=eq.${uid}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({ scheduled_plan_id: null, scheduled_cycle: null, scheduled_at: null, effective_at: null, updated_at: new Date().toISOString() }),
      });
      await recordSubEvent(url, key, { uid, actor: "owner", action: "schedule_undone" });
      await audit({ uid, action: "billing.undo_schedule", entity: "subscriptions", entityId: uid });
      return NextResponse.json({ ok: true, note: "Change undone — your plan stays as it is." });
    }

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
      await recordSubEvent(url, key, {
        uid, actor: "owner", action: b.action === "cancel" ? "cancelled" : "resumed",
        toStatus: patch.status, reason: patch.cancel_reason || null,
      });
      await audit({ uid, action: `billing.${b.action}`, entity: "subscriptions", entityId: uid, meta: { reason: b.reason } });
      return NextResponse.json({ ok: true });
    }

    // ---- checkout (MOCK: always succeeds) -----------------------------
    const cycle = b.cycle === "yearly" ? "yearly" : "monthly";
    const planRows = await fetch(`${url}/rest/v1/plans?id=eq.${b.planId}&is_active=eq.true&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
    const plan = Array.isArray(planRows) ? planRows[0] : null;
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 400 });

    const listPrice = Number(cycle === "yearly" ? plan.price_yearly : plan.price_monthly) || 0;

    // ---- V58: classify. Paying more applies now; anything else schedules
    // for period end — access never shrinks mid-cycle, and there's an undo.
    // No charge happens on the scheduled path, so coupons wait for checkout.
    const entNow = await getEntitlements(url, key, uid);
    if (classifyChange(entNow.effective, entNow.priceLocked, listPrice) === "scheduled") {
      const effAt = entNow.periodEnd || new Date(Date.now() + MONTH).toISOString();
      await fetch(`${url}/rest/v1/subscriptions?uid=eq.${uid}`, {
        method: "PATCH", headers: H(key, { Prefer: "return=minimal" }),
        body: JSON.stringify({
          scheduled_plan_id: plan.id, scheduled_cycle: cycle,
          scheduled_at: new Date().toISOString(), effective_at: effAt,
          cancel_at_period_end: false, updated_at: new Date().toISOString(),
        }),
      });
      await recordSubEvent(url, key, {
        uid, actor: "owner", action: "change_scheduled",
        fromPlanId: entNow.planId, toPlanId: plan.id, fromStatus: entNow.status, cycle,
        meta: { effective_at: effAt, coupon_deferred: !!b.coupon },
      });
      await audit({ uid, action: "billing.schedule", entity: "subscriptions", entityId: uid, meta: { to: plan.name, cycle, effAt } });
      return NextResponse.json({
        ok: true, scheduled: true, planName: plan.name, effectiveAt: effAt,
        note: `No charge today — ${plan.name} takes over on ${new Date(effAt).toLocaleDateString("en-IN")}. Your current plan runs until then.${b.coupon ? " Apply your coupon when it renews." : ""}`,
      });
    }

    // ---- coupon (optional) ----
    let discount = 0, couponCode: string | null = null;
    if (b.coupon) {
      const code = String(b.coupon).trim().toUpperCase().slice(0, 40);
      const cRows = await fetch(`${url}/rest/v1/coupons?code=eq.${encodeURIComponent(code)}&is_active=eq.true&select=*&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const c = Array.isArray(cRows) ? cRows[0] : null;
      const expired = c?.expires_at ? new Date(c.expires_at).getTime() < Date.now() : false;
      const exhausted = c?.max_redemptions != null && Number(c.redeemed || 0) >= Number(c.max_redemptions);
      // one use per business
      const usedRows = c ? await fetch(`${url}/rest/v1/coupon_redemptions?code=eq.${encodeURIComponent(code)}&uid=eq.${uid}&select=id&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []) : [];
      const alreadyUsed = Array.isArray(usedRows) && usedRows.length > 0;
      if (!c || expired || exhausted || alreadyUsed) {
        return NextResponse.json({ error: !c ? "That code isn't valid." : alreadyUsed ? "You've already used that code." : "That code has expired." }, { status: 400 });
      }
      discount = c.kind === "first_free" ? listPrice : c.kind === "flat" ? Math.min(listPrice, Number(c.value) || 0) : Math.round((listPrice * (Number(c.value) || 0)) / 100);
      couponCode = code;
    }

    const amount = Math.max(0, listPrice - discount);
    const now = new Date();

    // ---- V59: the charge goes through the adapter seam. The mock pays
    // instantly; a real gateway returns a redirect here and its webhook
    // calls the same applySuccessfulPayment below. One activation path.
    const checkout = await activeAdapter().createCheckout({ uid, planId: plan.id, planName: plan.name, cycle, amount });
    if (checkout.kind === "failed") return NextResponse.json({ error: checkout.error }, { status: 402 });
    if (checkout.kind === "redirect") return NextResponse.json({ ok: true, redirect: checkout.url, reference: checkout.reference });
    const reference = checkout.reference;

    // ---- invoice number: sequential per Indian financial year (Apr–Mar) ----
    let invoiceNo: string | null = null;
    try {
      const y = now.getFullYear(), m = now.getMonth(); // 0-based
      const fyStart = m >= 3 ? y : y - 1;
      const fy = `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`;
      const nRes = await fetch(`${url}/rest/v1/rpc/next_invoice_no`, {
        method: "POST", headers: H(key), body: JSON.stringify({ p_fy: fy }),
      });
      const n = await nRes.json();
      if (typeof n === "number") invoiceNo = `DAWN/${fy}/${String(n).padStart(4, "0")}`;
    } catch { /* invoice numbering is best-effort; payment still records */ }

    // The confirmed charge becomes reality — payment row, activation,
    // history event — through the ONE path a webhook will also use.
    const { periodEnd } = await applySuccessfulPayment(url, key, {
      uid, plan: { id: plan.id, name: plan.name }, cycle, amount, listPrice, discount,
      couponCode, reference, gateway: checkout.gateway, invoiceNo,
      fromPlanId: entNow.planId, fromStatus: entNow.status,
    });

    // Coupon bookkeeping
    if (couponCode) {
      await fetch(`${url}/rest/v1/coupon_redemptions`, { method: "POST", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ code: couponCode, uid, amount_off: discount }) }).catch(() => {});
      const cur = await fetch(`${url}/rest/v1/coupons?code=eq.${encodeURIComponent(couponCode)}&select=redeemed&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json()).catch(() => []);
      const redeemed = Number(cur?.[0]?.redeemed || 0) + 1;
      await fetch(`${url}/rest/v1/coupons?code=eq.${encodeURIComponent(couponCode)}`, { method: "PATCH", headers: H(key, { Prefer: "return=minimal" }), body: JSON.stringify({ redeemed }) }).catch(() => {});
    }

    // Payment receipt email (best-effort; needs an email on file)
    try {
      const uRows = await fetch(`${url}/rest/v1/dawn_users?uid=eq.${uid}&select=email&limit=1`, { headers: H(key), cache: "no-store" }).then((r) => r.json());
      const email = uRows?.[0]?.email;
      if (email) {
        await sendMail(email, `Payment received — ${plan.name}`, shell({
          heading: "Thanks — you're all set",
          body: `<p><strong>${plan.name}</strong> is active until ${periodEnd.toLocaleDateString("en-IN")}.</p>
            <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:14px;">
              <tr><td style="padding:5px 0;color:#5B6478;">Plan</td><td align="right"><strong>${plan.name} · ${cycle}</strong></td></tr>
              ${discount > 0 ? `<tr><td style="padding:5px 0;color:#5B6478;">List price</td><td align="right">₹${listPrice.toLocaleString("en-IN")}</td></tr><tr><td style="padding:5px 0;color:#059669;">Discount (${couponCode})</td><td align="right" style="color:#059669;">−₹${discount.toLocaleString("en-IN")}</td></tr>` : ""}
              <tr><td style="padding:8px 0;border-top:1px solid #EEF1F7;"><strong>Paid</strong></td><td align="right" style="border-top:1px solid #EEF1F7;"><strong>₹${amount.toLocaleString("en-IN")}</strong></td></tr>
              ${invoiceNo ? `<tr><td style="padding:5px 0;color:#5B6478;">Invoice</td><td align="right">${invoiceNo}</td></tr>` : ""}
              <tr><td style="padding:5px 0;color:#5B6478;">Reference</td><td align="right">${reference}</td></tr>
            </table>`,
          ctaLabel: "View billing", ctaHref: `${APP}/dashboard/billing`,
          footnote: "This is a test-mode payment while Dawn's live gateway is being set up.",
        }));
      }
    } catch { /* never block a payment on email */ }

    await audit({ uid, action: "billing.payment", entity: "payments", entityId: reference, meta: { plan: plan.name, amount, cycle, gateway: "mock", invoiceNo, couponCode, discount } });
    return NextResponse.json({ ok: true, reference, invoiceNo, amount, discount, planName: plan.name, periodEnd: periodEnd.toISOString() });
  } catch { return NextResponse.json({ error: "Payment failed." }, { status: 500 }); }
}
