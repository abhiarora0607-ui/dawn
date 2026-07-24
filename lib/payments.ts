// lib/payments.ts
// The seam where real money will plug in (V59). Two pieces:
//
//   1. PaymentAdapter — how a charge is attempted. The mock succeeds
//      instantly; Razorpay/Stripe later return a redirect and confirm via
//      webhook. Swapping gateways = implementing this interface. Nothing
//      else in the product moves.
//
//   2. applySuccessfulPayment — the ONE path by which a successful charge
//      becomes reality: payment row recorded, subscription activated,
//      history event written. The billing route calls it today; a gateway
//      webhook calls the very same function tomorrow. Activation logic that
//      lives in one place can't drift between "user clicked pay" and
//      "gateway confirmed pay" — the classic double-implementation bug in
//      homegrown billing.

import { recordSubEvent } from "@/lib/billing-events";
import { H } from "@/lib/http";

const MONTH = 30 * 86400000, YEAR = 365 * 86400000;

export type CheckoutRequest = {
  uid: string;
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
  amount: number;          // what will actually be charged (after discount)
};

export type CheckoutResult =
  | { kind: "paid"; reference: string; gateway: string }
  | { kind: "redirect"; url: string; reference: string; gateway: string }
  | { kind: "failed"; error: string };

export interface PaymentAdapter {
  name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
}

/** The mock gateway: always succeeds, visibly test money. */
export const mockAdapter: PaymentAdapter = {
  name: "mock",
  async createCheckout() {
    const reference = `MOCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return { kind: "paid", reference, gateway: "mock" };
  },
};

/** Which gateway is live. Razorpay arrives here as an env switch, nowhere else. */
export function activeAdapter(): PaymentAdapter {
  return mockAdapter;
}

/** A confirmed charge becomes reality — payment row, activation, event.
 *  Called by the billing route today; called by the gateway webhook tomorrow. */
export async function applySuccessfulPayment(url: string, key: string, p: {
  uid: string;
  plan: { id: string; name: string };
  cycle: "monthly" | "yearly";
  amount: number;
  listPrice: number;
  discount: number;
  couponCode: string | null;
  reference: string;
  gateway: string;
  invoiceNo: string | null;
  fromPlanId: string | null;
  fromStatus: string | null;
}): Promise<{ periodEnd: Date }> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + (p.cycle === "yearly" ? YEAR : MONTH));

  await fetch(`${url}/rest/v1/payments`, {
    method: "POST", headers: H(key, { Prefer: "return=minimal" }),
    body: JSON.stringify({
      uid: p.uid, plan_id: p.plan.id, plan_name: p.plan.name, amount: p.amount, currency: "₹",
      billing_cycle: p.cycle, period_start: now.toISOString(), period_end: periodEnd.toISOString(),
      status: "succeeded", gateway: p.gateway, reference: p.reference, invoice_no: p.invoiceNo,
      coupon_code: p.couponCode, discount: p.discount,
    }),
  });

  await fetch(`${url}/rest/v1/subscriptions`, {
    method: "POST", headers: H(key, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({
      uid: p.uid, plan_id: p.plan.id, status: "active", billing_cycle: p.cycle,
      period_start: now.toISOString(), period_end: periodEnd.toISOString(),
      price_locked: p.amount, cancel_at_period_end: false, updated_at: now.toISOString(),
      scheduled_plan_id: null, scheduled_cycle: null, scheduled_at: null, effective_at: null,
    }),
  });

  await recordSubEvent(url, key, {
    uid: p.uid, actor: "owner", action: "plan_changed",
    fromPlanId: p.fromPlanId, toPlanId: p.plan.id,
    fromStatus: p.fromStatus, toStatus: "active", cycle: p.cycle,
    meta: { amount: p.amount, reference: p.reference, invoiceNo: p.invoiceNo, couponCode: p.couponCode, gateway: p.gateway },
  });

  return { periodEnd };
}
