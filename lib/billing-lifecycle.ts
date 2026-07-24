// lib/billing-lifecycle.ts
// The pure core of V58's plan-change rules, extracted so the matrix is
// rule-tested like everything else that touches money.
//
// The worldwide standard, in two sentences: PAYING MORE APPLIES NOW (you get
// what you're buying immediately; the period restarts at the new price).
// ANYTHING ELSE WAITS FOR RENEWAL (a downgrade or a same-price/cycle switch
// never shrinks access mid-cycle — it schedules, visibly, with an undo).
// And anyone not currently in a paid period (trial, grace, expired, or
// complimentary choosing to pay) is simply subscribing: immediate.

export function classifyChange(
  effective: string,
  currentPrice: number | null,
  targetPrice: number,
): "immediate" | "scheduled" {
  // Not inside a paid, running period → this is a (re)subscription, not a
  // mid-cycle change. Applies now.
  if (effective !== "active") return "immediate";
  // Mid-cycle: strictly paying more = upgrade = now. Equal or less waits.
  return targetPrice > (currentPrice ?? 0) ? "immediate" : "scheduled";
}

/** Is a stored schedule due to apply? Cancel-at-period-end blocks it — a
 *  business that's leaving doesn't get moved to a new plan on the way out. */
export function scheduleDue(
  sub: { scheduled_plan_id?: string | null; effective_at?: string | null; cancel_at_period_end?: boolean | null },
  now: number,
): boolean {
  if (!sub.scheduled_plan_id || !sub.effective_at) return false;
  if (sub.cancel_at_period_end) return false;
  return now >= new Date(sub.effective_at).getTime();
}

/** What the business will be charged next, and when — the single sentence a
 *  billing page owes its user. Scheduled changes win (the next charge is the
 *  NEW plan's price on its effective date); cancels mean no charge; trials
 *  prompt a pick. Pure, so the matrix is rule-tested. */
export type UpcomingCharge = {
  kind: "renewal" | "scheduled" | "none" | "pick";
  amount: number | null;
  date: string | null;
  label: string;
};

export function upcomingInvoice(
  ent: {
    effective: string; planId: string | null; planName: string;
    priceLocked: number | null; periodEnd: string | null; cycle: string;
    cancelAtPeriodEnd: boolean; trialEndsAt: string | null;
    scheduledPlanId: string | null; scheduledPlanName: string | null;
    scheduledCycle: string | null; scheduledEffectiveAt: string | null;
  },
  plans: Array<{ id: string; price_monthly?: any; price_yearly?: any }>,
): UpcomingCharge {
  const dstr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN") : "renewal");
  if (ent.effective === "complimentary") {
    return { kind: "none", amount: null, date: null, label: "Complimentary — no charges." };
  }
  if (ent.effective === "trialing") {
    return { kind: "pick", amount: null, date: ent.trialEndsAt, label: `Trial ends ${dstr(ent.trialEndsAt)} — pick a plan to continue.` };
  }
  if (ent.effective === "expired") {
    return { kind: "pick", amount: null, date: null, label: "Subscription ended — pick a plan to continue." };
  }
  if (ent.cancelAtPeriodEnd) {
    return { kind: "none", amount: null, date: ent.periodEnd, label: `No upcoming charge — access ends ${dstr(ent.periodEnd)}.` };
  }
  if (ent.scheduledPlanId) {
    const sp = plans.find((x) => x.id === ent.scheduledPlanId) || null;
    const cyc = ent.scheduledCycle || ent.cycle;
    return {
      kind: "scheduled", amount: priceFor(sp, cyc), date: ent.scheduledEffectiveAt,
      label: `${ent.scheduledPlanName || "New plan"} · ${cyc} starts ${dstr(ent.scheduledEffectiveAt)}.`,
    };
  }
  const cur = ent.planId ? plans.find((x) => x.id === ent.planId) || null : null;
  const amount = ent.priceLocked ?? priceFor(cur, ent.cycle);
  const overdue = ent.effective === "grace";
  return {
    kind: "renewal", amount, date: ent.periodEnd,
    label: overdue ? `Renewal overdue — pay to continue past the grace window.` : `Renews ${dstr(ent.periodEnd)} · ${ent.planName} · ${ent.cycle}.`,
  };
}

/** The price a plan charges for a cycle, defensively. */
export function priceFor(plan: { price_monthly?: any; price_yearly?: any } | null | undefined, cycle: string): number {
  if (!plan) return 0;
  return Number(cycle === "yearly" ? plan.price_yearly : plan.price_monthly) || 0;
}
