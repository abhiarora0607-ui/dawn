// lib/api-types.ts
// Response shapes for the endpoints that have caused shape-mismatch bugs.
//
// The pattern behind V39's phantom-table crash and V41's wrong-field crash was
// the same: a component read d.someField that the API didn't actually return,
// and nothing caught it until it ran. Everything was `any`, so TypeScript had
// nothing to check.
//
// These contracts don't cover all 60 endpoints — that's a rewrite. They cover
// the handful where a mismatch actually bit, so useApi<PayrollResponse> makes
// the compiler reject d.payslip (should be d.payslips) instead of shipping it.
//
// Each type mirrors exactly what the route's NextResponse.json returns. When a
// route's shape changes, its type changes with it, and every reader updates or
// fails to compile — which is the whole point.

// ---- shared fragments -------------------------------------------------------

/** Every endpoint may return this instead of its normal shape. */
export type ApiError = { error: string };

export type PayslipLine = {
  id?: string;
  kind: "base" | "bonus" | "deduction" | "commission" | "encashment";
  label: string;
  amount: number;
};

export type Payslip = {
  id: string;
  employee_id: string;
  employee_name: string;
  month: string;
  status: "draft" | "approved" | "paid" | "cancelled" | "rejected";
  statusLabel: string;
  base_amount: number;
  additions: number;
  deductions: number;
  net_amount: number;
  commission_base?: number;
  unpaid_days?: number;
  note?: string | null;
  paid_at?: string | null;
  lines: PayslipLine[];
};

// ---- /api/payroll -----------------------------------------------------------

export type PayrollResponse = {
  month: string;
  canPrepare: boolean;
  canApprove: boolean;
  canPay: boolean;
  payslips: Payslip[];
  missing: { id: string; name: string; salary: number }[];
  pendingBonuses: {
    id: string; employee_id: string; employee_name: string;
    amount: number; reason?: string; requested_by_name: string;
  }[];
  totals: {
    count: number;
    [k: string]: number;
  };
};

// ---- /api/team/my-team ------------------------------------------------------

export type TeamMember = {
  id: string;
  name: string;
  jobTitle?: string;
  presence?: string;
  hours?: string | null;
  flagged?: boolean;
  revenue: number;
  orders: number;
  expenses: number;
  salary: number | null;      // null when the viewer lacks salary_view
};

export type MyTeamResponse = {
  isManager: boolean;
  today: string;
  month?: string;
  canSeeSalary: boolean;
  canProposeSalary?: boolean;
  team: TeamMember[];
  totals?: {
    mine: { revenue: number; orders: number; expenses: number };
    team: { revenue: number; orders: number; expenses: number; salary: number | null };
    combined: { revenue: number; orders: number; expenses: number };
    headcount: number;
  };
  pending?: { leave: number; fixes: number };
};

// ---- /api/leave (balances view) ---------------------------------------------

export type LeaveBalance = {
  code: string;
  accrued: number;
  used: number;
  carried_in: number;
  granted: number;
  encashed: number;
  available: number;
  infinite: boolean;
};

export type LeaveBalancesResponse = {
  year: number;
  types: { code: string; label: string }[];
  rows: { id: string; name: string; role?: string; balances: LeaveBalance[] }[];
};

// ---- helper -----------------------------------------------------------------

/**
 * Narrow a useApi result to its success shape or null. Callers that pass a
 * typed parameter to useApi already get this, but this documents the intent at
 * call sites that were previously `any`.
 */
export function isError<T>(data: T | ApiError | null): data is ApiError {
  return !!data && typeof data === "object" && "error" in data;
}
