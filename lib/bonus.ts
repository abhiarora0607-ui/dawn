// lib/bonus.ts
// The kinds of bonus an admin or finance can give, beyond commission.
//
// Commission is automatic and rides payroll on its own. These are the
// discretionary ones:
//   · cash        — a plain cash bonus (the original behaviour)
//   · gift        — a festival/occasion gift (Diwali, anniversary)
//   · performance — a reward for good work
//   · leave_gift  — NOT cash. Grants earned-leave days through the leave-grant
//                   system. It never becomes a payslip line; it lands in the
//                   employee's leave balance instead.
//
// The first three are cash-bearing and live in bonus_requests. leave_gift
// forks to the leave grant path, so this module is the one place that knows
// which kinds are money and which is leave.

export type BonusKind = "cash" | "gift" | "performance" | "leave_gift";

export type BonusKindDef = {
  id: BonusKind;
  label: string;
  /** How the amount is entered and what it means. */
  unit: "money" | "days";
  /** Cash kinds ride a payslip; leave_gift grants leave instead. */
  cash: boolean;
  hint?: string;
};

export const BONUS_KINDS: BonusKindDef[] = [
  { id: "cash", label: "Cash bonus", unit: "money", cash: true,
    hint: "A one-off amount on their next payslip." },
  { id: "gift", label: "Gift / festival", unit: "money", cash: true,
    hint: "A festival or occasion gift — Diwali, a work anniversary." },
  { id: "performance", label: "Performance bonus", unit: "money", cash: true,
    hint: "A reward for strong work, on their next payslip." },
  { id: "leave_gift", label: "Gift of leave", unit: "days", cash: false,
    hint: "Adds earned-leave days to their balance — not a cash payment." },
];

const BY_ID: Record<string, BonusKindDef> = {};
for (const k of BONUS_KINDS) BY_ID[k.id] = k;

/** The cash-bearing kinds — the only ones that belong in bonus_requests. */
export const CASH_BONUS_KINDS = BONUS_KINDS.filter((k) => k.cash).map((k) => k.id);

export function isBonusKind(x: string): x is BonusKind {
  return x in BY_ID;
}

/** Is this a cash bonus (rides payroll) rather than a leave gift? */
export function isCashBonus(kind: string): boolean {
  return !!BY_ID[kind]?.cash;
}

export function bonusKindDef(kind: string): BonusKindDef | undefined {
  return BY_ID[kind];
}

/** The label a payslip line shows for a cash bonus of this kind. */
export function bonusLineLabel(kind: string, reason?: string | null): string {
  const base = BY_ID[kind]?.label || "Bonus";
  const r = (reason || "").trim();
  return r ? `${base} — ${r}` : base;
}
