// lib/payroll.ts
// What a payslip contains, and when it may move.
//
// The rule this file exists to enforce: MONEY REACHES THE BOOKS ONLY WHEN
// SOMEONE SAYS IT WAS PAID. Before V39 the overnight cron posted a salary
// expense every month whether or not anybody had transferred anything, so the
// books recorded intention rather than fact. A payslip sits in between:
//
//   draft ──approve──> approved ──mark paid──> paid ──> expense row created
//
// Everything owed to a person in a month rides the same payslip — base, bonus,
// encashment — because two salary rows for one person in one month reads as a
// double payment to whoever is doing the paying.

export type PayslipStatus = "draft" | "approved" | "paid" | "cancelled" | "rejected";

export type PayslipLine = {
  kind: "base" | "bonus" | "encashment" | "deduction";
  label: string;
  amount: number;
  sourceId?: string | null;
};

/** Additions are positive, deductions negative, net is what's actually paid. */
export function totalsOf(lines: PayslipLine[]): {
  base: number; additions: number; deductions: number; net: number;
} {
  let base = 0, additions = 0, deductions = 0;
  for (const l of lines) {
    const amt = Number(l.amount || 0);
    if (l.kind === "base") base += amt;
    else if (l.kind === "deduction") deductions += Math.abs(amt);
    else additions += amt;
  }
  return {
    base: round(base),
    additions: round(additions),
    deductions: round(deductions),
    net: round(base + additions - deductions),
  };
}

function round(n: number) { return Math.round(n * 100) / 100; }

/**
 * Which moves are legal. Written as data rather than scattered `if` checks so
 * that "can this be paid?" has exactly one answer everywhere it's asked.
 *
 * Nothing returns from `paid` — once an expense exists, reversing it is an
 * accounting correction, not a status change.
 */
const TRANSITIONS: Record<PayslipStatus, PayslipStatus[]> = {
  draft: ["approved", "rejected", "cancelled"],
  // Approving does not release money. Paying is a separate act by a separate
  // hand — the maker-checker split that stops one person drafting, approving
  // and paying their own figure.
  approved: ["paid", "draft", "cancelled"],
  // V47: rejection is a round trip, not a dead end. The usual cause is a wrong
  // number, and the fix is to correct the draft and resubmit — so rejected
  // returns to draft carrying the reason it was sent back.
  rejected: ["draft", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransition(from: PayslipStatus, to: PayslipStatus): boolean {
  return (TRANSITIONS[from] || []).includes(to);
}

export function transitionError(from: PayslipStatus, to: PayslipStatus): string | null {
  if (canTransition(from, to)) return null;
  if (from === "paid") return "This payslip is already paid — correct it with an expense adjustment instead.";
  if (from === "cancelled") return "This payslip was cancelled.";
  if (from === "draft" && to === "paid") return "Approve it before marking it paid.";
  if (from === "rejected" && to === "approved") return "Send it back to draft and fix the figures first.";
  return `Can't move a ${from} payslip to ${to}.`;
}

/** Whether the figures on a payslip can still be changed. */
export function isEditable(status: PayslipStatus): boolean {
  // Only a draft. Once approved, changing the number behind the approval would
  // make the sign-off meaningless.
  return status === "draft";
}

/**
 * Build a month's payslip for one person.
 *
 * Deliberately does no database work: given a salary, the approved bonuses and
 * the approved encashments, it returns the lines. That makes the composition
 * testable without a database, which matters because this is the arithmetic
 * that decides what someone gets paid.
 */
export function buildPayslip(opts: {
  employeeName: string;
  monthlySalary: number;
  bonuses: { id: string; amount: number; reason?: string | null }[];
  encashments: { id: string; days: number; amount: number; label: string }[];
  joiningDate?: string | null;
  month: string;                       // "2026-07"
  /** Days taken as unpaid leave in this month. Deducted at the day rate. */
  unpaidDays?: number;
  /** Commission earned, already calculated. */
  commission?: { amount: number; label: string } | null;
}): { lines: PayslipLine[]; totals: ReturnType<typeof totalsOf>; proRata: boolean; dayRate: number } {
  const lines: PayslipLine[] = [];

  // Someone who joined mid-month is paid for the days they worked. Paying a
  // full month for eleven days of work is a mistake in the employee's favour
  // that nobody notices until it's happened several times.
  let base = Number(opts.monthlySalary || 0);
  let proRata = false;
  if (opts.joiningDate && opts.joiningDate.slice(0, 7) === opts.month) {
    const year = Number(opts.month.slice(0, 4)), m = Number(opts.month.slice(5, 7));
    const daysInMonth = new Date(year, m, 0).getDate();
    const joinDay = Number(opts.joiningDate.slice(8, 10));
    const worked = daysInMonth - joinDay + 1;
    if (worked < daysInMonth) {
      base = round(base * worked / daysInMonth);
      proRata = true;
    }
  }

  lines.push({
    kind: "base",
    label: proRata ? `Salary (from ${opts.joiningDate})` : "Monthly salary",
    amount: base,
  });

  // Unpaid leave. The day rate divides by the days in THIS month, not by 30 —
  // otherwise the same salary produces a different daily value in February
  // than in July, and someone taking three unpaid days in a short month is
  // penalised for the calendar.
  const daysInThisMonth = new Date(Number(opts.month.slice(0, 4)), Number(opts.month.slice(5, 7)), 0).getDate();
  const dayRate = round(Number(opts.monthlySalary || 0) / daysInThisMonth);

  const unpaid = Number(opts.unpaidDays || 0);
  if (unpaid > 0) {
    lines.push({
      kind: "deduction",
      label: `${unpaid} ${unpaid === 1 ? "day" : "days"} unpaid leave`,
      amount: round(dayRate * unpaid),
    });
  }

  if (opts.commission && opts.commission.amount > 0) {
    lines.push({
      kind: "bonus",
      label: opts.commission.label,
      amount: opts.commission.amount,
    });
  }

  for (const b of opts.bonuses) {
    lines.push({ kind: "bonus", label: b.reason ? `Bonus — ${b.reason}` : "Bonus", amount: Number(b.amount || 0), sourceId: b.id });
  }
  for (const e of opts.encashments) {
    lines.push({
      kind: "encashment",
      label: `${e.days} ${e.days === 1 ? "day" : "days"} of ${e.label} encashed`,
      amount: Number(e.amount || 0),
      sourceId: e.id,
    });
  }

  return { lines, totals: totalsOf(lines), proRata, dayRate };
}

/** The expense note, so the books read the same as the payslip. */
export function expenseNoteFor(employeeName: string, month: string, totals: { base: number; additions: number }): string {
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  if (totals.additions > 0) {
    return `Salary — ${employeeName}, ${label} (₹${totals.base.toLocaleString("en-IN")} + ₹${totals.additions.toLocaleString("en-IN")} additions)`;
  }
  return `Salary — ${employeeName}, ${label}`;
}

export const STATUS_LABEL: Record<PayslipStatus, string> = {
  draft: "Draft", approved: "Approved", paid: "Paid",
  cancelled: "Cancelled", rejected: "Sent back",
};

export const STATUS_PILL: Record<PayslipStatus, string> = {
  draft: "pill-grey", approved: "pill-sky", paid: "pill-green",
  cancelled: "pill-red", rejected: "pill-amber",
};
