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

/** The price a plan charges for a cycle, defensively. */
export function priceFor(plan: { price_monthly?: any; price_yearly?: any } | null | undefined, cycle: string): number {
  if (!plan) return 0;
  return Number(cycle === "yearly" ? plan.price_yearly : plan.price_monthly) || 0;
}
