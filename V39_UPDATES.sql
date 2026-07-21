-- ============================================================================
-- Dawn — V39: Payroll documents (payslips, bonuses)
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V39 code.
-- Additive and safe to re-run. Requires V31A, V31B and V38.
-- ============================================================================

-- 1) PAYSLIPS ----------------------------------------------------------------
-- The document that sits between "we owe this person money" and "the books say
-- we spent it". Before V39 the cron posted a salary expense straight into
-- expenses every month whether or not anyone had paid it, which meant the books
-- recorded intent rather than fact.
--
-- draft → approved → paid. The expense row is created at the LAST step only.
CREATE TABLE IF NOT EXISTS payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  month text NOT NULL,                      -- "2026-07"
  status text DEFAULT 'draft',              -- draft | approved | paid | cancelled
  base_amount numeric DEFAULT 0,
  additions numeric DEFAULT 0,              -- bonuses + encashment
  deductions numeric DEFAULT 0,
  net_amount numeric DEFAULT 0,
  note text,
  approved_at timestamptz,
  approved_by text,
  paid_at timestamptz,
  paid_by text,
  expense_id uuid,                          -- the row created when marked paid
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
-- One payslip per person per month: the guard against paying someone twice.
CREATE UNIQUE INDEX IF NOT EXISTS payslips_unique_idx ON payslips(uid, employee_id, month);
CREATE INDEX IF NOT EXISTS payslips_month_idx ON payslips(uid, month, status);

-- 2) PAYSLIP LINES -----------------------------------------------------------
-- Why the number is the number. An employee asking "why was last month more?"
-- should be able to see the answer without asking anyone.
CREATE TABLE IF NOT EXISTS payslip_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  payslip_id uuid NOT NULL,
  kind text NOT NULL,                       -- base | bonus | encashment | deduction
  label text NOT NULL,
  amount numeric NOT NULL,
  source_id uuid,                           -- the bonus/encashment it came from
  created_at timestamptz DEFAULT now()
);
ALTER TABLE payslip_lines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payslip_lines_idx ON payslip_lines(uid, payslip_id);

-- 3) BONUS REQUESTS ----------------------------------------------------------
-- A lead proposes, an admin approves. A lead who could grant money directly
-- would be a lead who could pay their friends.
CREATE TABLE IF NOT EXISTS bonus_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text,
  status text DEFAULT 'pending',            -- pending | approved | rejected | paid
  requested_by uuid,                        -- the lead who proposed it
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  paid_in_month text,                       -- set when it rides a payslip
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bonus_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS bonus_uid_status_idx ON bonus_requests(uid, status);
CREATE INDEX IF NOT EXISTS bonus_unpaid_idx ON bonus_requests(uid, employee_id)
  WHERE status = 'approved' AND paid_in_month IS NULL;

-- 4) PAYROLL SETTINGS --------------------------------------------------------
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS payroll_enabled boolean DEFAULT true;
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS payroll_day int DEFAULT 1;   -- day of month payslips are generated

-- 5) STOP THE AUTOMATIC SALARY POSTING ---------------------------------------
-- Salary now flows through payslips. Leaving these enabled would post an
-- expense on the old path AND on the new one — every salary counted twice.
--
-- Non-salary recurring expenses (rent, subscriptions) are untouched: they have
-- no approval step to wait for and should keep posting automatically.
UPDATE recurring_expenses SET enabled = false WHERE source = 'salary';
