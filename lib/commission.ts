// lib/commission.ts
// Working out what a salesperson has earned.
//
// Two decisions shape everything here, and both are worth stating plainly
// because they're policy rather than arithmetic:
//
//   1. COMMISSION IS PAID ON MONEY RECEIVED, never on money invoiced. An order
//      raised but unpaid is a promise; paying commission on it means the
//      business hands out cash it hasn't collected, and then tries to claw it
//      back if the customer never pays. Every figure here comes from
//      amount_paid, and cancelled orders are excluded entirely.
//
//   2. BASIS IS PER PERSON, not per role. A lead may earn on their own sales
//      or on their whole team's; so may a member who happens to manage people.
//      The engine asks the org tree who sits beneath someone and doesn't care
//      what they're called — which means it needs no special case for leads.

export type CommissionBasis = "own" | "team";

export type CommissionConfig = {
  employeeId: string;
  eligible: boolean;
  basis: CommissionBasis;
  /** Percentage of revenue. 2.5 means two and a half percent. */
  rate: number;
};

export type OrderRow = {
  employeeId: string | null;
  amountPaid: number;
  status?: string | null;
};

/** Orders that count. Cancelled ones never do, whatever was collected. */
export function countableOrders(orders: OrderRow[]): OrderRow[] {
  return orders.filter((o) => o.status !== "Cancelled" && Number(o.amountPaid || 0) > 0);
}

/** Revenue received, per employee. */
export function revenueByEmployee(orders: OrderRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of countableOrders(orders)) {
    if (!o.employeeId) continue;                 // unattributed revenue pays nobody
    out[o.employeeId] = (out[o.employeeId] || 0) + Number(o.amountPaid || 0);
  }
  return out;
}

/**
 * The revenue a commission is calculated against.
 *
 * On "team" basis this includes the person themselves — a lead who sells
 * alongside their team is credited for both, which is what "my team's numbers"
 * means to the person accountable for them.
 */
export function basisRevenue(
  config: CommissionConfig,
  revenue: Record<string, number>,
  subtreeOf: (id: string) => string[],
): number {
  const own = revenue[config.employeeId] || 0;
  if (config.basis === "own") return round(own);

  let total = own;
  for (const id of subtreeOf(config.employeeId)) total += revenue[id] || 0;
  return round(total);
}

/** What one person earns this month. */
export function commissionFor(
  config: CommissionConfig,
  revenue: Record<string, number>,
  subtreeOf: (id: string) => string[],
): { amount: number; base: number; rate: number } {
  if (!config.eligible || !(config.rate > 0)) {
    return { amount: 0, base: 0, rate: config.rate || 0 };
  }
  const base = basisRevenue(config, revenue, subtreeOf);
  return {
    amount: round(base * config.rate / 100),
    base,
    rate: config.rate,
  };
}

/** The line that appears on the payslip, phrased so it can be checked. */
export function commissionLabel(c: { base: number; rate: number }, basis: CommissionBasis): string {
  const scope = basis === "team" ? "team revenue" : "revenue";
  return `Commission — ${c.rate}% of ₹${c.base.toLocaleString("en-IN")} ${scope}`;
}

/**
 * What a whole month would cost, for the preview on the settings screen.
 *
 * The overlap figure matters more than the total. When a lead earns on team
 * revenue while their members earn on their own, the same order pays
 * commission twice — legitimate, and how override commission has always
 * worked, but it should be visible before payroll rather than discovered
 * during it.
 */
export function previewCost(
  configs: CommissionConfig[],
  revenue: Record<string, number>,
  subtreeOf: (id: string) => string[],
): {
  rows: { employeeId: string; amount: number; base: number; rate: number }[];
  totalCommission: number;
  totalRevenue: number;
  /** Commission as a share of revenue. Above ~100% means something is wrong. */
  effectiveRate: number;
  /** True when at least one order is paying commission more than once. */
  hasOverlap: boolean;
} {
  const rows = configs.map((c) => ({ employeeId: c.employeeId, ...commissionFor(c, revenue, subtreeOf) }));
  const totalCommission = round(rows.reduce((n, r) => n + r.amount, 0));
  const totalRevenue = round(Object.values(revenue).reduce((n, v) => n + v, 0));

  // Overlap: someone on team basis whose subtree contains another eligible
  // person. That order's revenue is counted in both their bases.
  const eligible = new Set(configs.filter((c) => c.eligible && c.rate > 0).map((c) => c.employeeId));
  const hasOverlap = configs.some((c) =>
    c.eligible && c.rate > 0 && c.basis === "team" &&
    subtreeOf(c.employeeId).some((id) => eligible.has(id)));

  return {
    rows,
    totalCommission,
    totalRevenue,
    effectiveRate: totalRevenue > 0 ? round(totalCommission / totalRevenue * 100) : 0,
    hasOverlap,
  };
}

function round(n: number) { return Math.round(n * 100) / 100; }

// ------------------------------------------------------------ month guard

/**
 * Payroll may only be drafted for a month that has finished.
 *
 * Drafting June on the 5th of June produces a payslip built from five days of
 * attendance and a third of the month's revenue — a number that looks
 * authoritative and is simply wrong. June becomes available on 1 July.
 */
export function monthIsComplete(month: string, today: string): boolean {
  // Both are "YYYY-MM" / "YYYY-MM-DD", so string comparison is date comparison.
  return month < today.slice(0, 7);
}

export function monthGuardError(month: string, today: string): string | null {
  if (monthIsComplete(month, today)) return null;
  const current = today.slice(0, 7);
  if (month === current) {
    const label = new Date(`${month}-01T00:00:00Z`)
      .toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
    return `${label} hasn't finished yet. Payroll can be drafted from the 1st of next month, once attendance and revenue are final.`;
  }
  return "That month is in the future.";
}

/** The most recent month that can be drafted. */
export function latestDraftableMonth(today: string): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
