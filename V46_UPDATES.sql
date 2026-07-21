-- ============================================================================
-- Dawn — V46: Payroll accuracy, commission, gifted leave
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V46 code.
-- Additive and safe to re-run. Requires V38–V45.
-- ============================================================================

-- 1) COMMISSION CONFIGURATION ------------------------------------------------
-- Per person rather than a global policy, because the same business pays a
-- lead on their team's revenue and a junior on their own. One switch for the
-- whole company can't express that.
--
-- basis: 'own'  → revenue from orders attributed to them
--        'team' → their whole subtree (V38), themselves included
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_eligible boolean DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_basis text DEFAULT 'own';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_rate numeric DEFAULT 0;

ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_commission_basis_check;
ALTER TABLE employees ADD CONSTRAINT employees_commission_basis_check
  CHECK (commission_basis IN ('own', 'team'));

-- A rate above 100% of revenue is always a typo, and one that would quietly
-- pay out more than the business earned.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_commission_rate_check;
ALTER TABLE employees ADD CONSTRAINT employees_commission_rate_check
  CHECK (commission_rate >= 0 AND commission_rate <= 100);

-- 2) GIFTED LEAVE ------------------------------------------------------------
-- `granted` is deliberately its OWN column rather than an addition to
-- `accrued`. Accrual is recomputed every month and again at year-end from the
-- policy — anything folded into it would be silently erased the next time that
-- ran, and the employee would lose days nobody could explain.
ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS granted numeric DEFAULT 0;

-- The record of who gave what, and why. A balance that changed with no
-- explanation is the kind of thing that surfaces months later in an argument.
CREATE TABLE IF NOT EXISTS leave_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  code text NOT NULL,                    -- one of the nine fixed leave types
  year int NOT NULL,
  days numeric NOT NULL,
  reason text,
  granted_by text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE leave_grants ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leave_grants_emp_idx ON leave_grants(uid, employee_id, year);

-- 3) PAYROLL ------------------------------------------------------------------
-- Unpaid days deducted, and commission paid, both need to be visible on the
-- payslip rather than folded into a single number. `kind` already carries
-- base | bonus | encashment | deduction; commission joins it as its own kind
-- so the line can be labelled and traced back to the revenue behind it.
--
-- No schema change is required for that — `kind` is free text — but the
-- payslip needs somewhere to record what the commission was calculated from,
-- or nobody can check it afterwards.
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS commission_base numeric DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS unpaid_days numeric DEFAULT 0;

-- 4) BACKFILL ------------------------------------------------------------------
-- Existing balances have no gifted days; make that explicit rather than null,
-- so the availability sum never has to defend against a missing column.
UPDATE leave_balances SET granted = 0 WHERE granted IS NULL;
UPDATE employees SET commission_eligible = false WHERE commission_eligible IS NULL;
UPDATE employees SET commission_basis = 'own' WHERE commission_basis IS NULL;
UPDATE employees SET commission_rate = 0 WHERE commission_rate IS NULL;
