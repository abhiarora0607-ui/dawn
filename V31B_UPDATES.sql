-- ============================================================================
-- Dawn — V31b: Leave
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V31b code.
-- Additive and safe to re-run. Requires V31A_UPDATES.sql to have run first.
-- ============================================================================

-- 1) LEAVE POLICY KNOBS (on the existing attendance settings row) ------------
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS leave_enabled boolean DEFAULT true;
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS carry_forward_cap numeric DEFAULT 12;  -- days carried into the new year, in total
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS encash_cap numeric DEFAULT 5;          -- days encashable at year end
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS year_end_done text;                    -- "2026" once processed, so it runs once

-- 2) LEAVE TYPES -------------------------------------------------------------
-- A fixed catalogue: the owner tunes each type but cannot rename or invent
-- them, so the vocabulary stays the same across every business and an
-- employee moving between shops sees words they already understand.
CREATE TABLE IF NOT EXISTS leave_types (
  uid text NOT NULL,
  code text NOT NULL,                     -- casual | earned | sick | bereavement | birthday | maternity | paternity | marriage | unpaid
  accrual text DEFAULT 'monthly',         -- monthly | yearly | none  ('none' = unpaid, infinite)
  amount numeric DEFAULT 0,               -- days per accrual period
  enabled boolean DEFAULT true,
  carries_forward boolean DEFAULT false,
  encashable boolean DEFAULT false,
  sort_order int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (uid, code)
);
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;

-- 3) BALANCES ----------------------------------------------------------------
-- One row per person per type per year. `last_accrued` is a month tag
-- ("2026-07") which makes monthly accrual idempotent — the cron can run
-- twice in a day and nobody gains a day of leave.
CREATE TABLE IF NOT EXISTS leave_balances (
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  code text NOT NULL,
  year int NOT NULL,
  accrued numeric DEFAULT 0,
  used numeric DEFAULT 0,
  carried_in numeric DEFAULT 0,
  encashed numeric DEFAULT 0,
  lapsed numeric DEFAULT 0,
  last_accrued text,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (uid, employee_id, code, year)
);
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leave_bal_emp_idx ON leave_balances(uid, employee_id, year);

-- 4) LEAVE REQUESTS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  code text NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  days numeric NOT NULL,
  half_day boolean DEFAULT false,
  reason text,
  status text DEFAULT 'pending',          -- pending | approved | rejected | cancelled
  is_unpaid_fallback boolean DEFAULT false, -- balance ran out, taken as unpaid
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leave_req_uid_status_idx ON leave_requests(uid, status, from_date);
CREATE INDEX IF NOT EXISTS leave_req_emp_idx ON leave_requests(uid, employee_id, from_date);

-- 5) ENCASHMENT REQUESTS -----------------------------------------------------
-- Never automatic. The employee asks, the owner approves, and only then does
-- the amount ride along on the next salary expense.
CREATE TABLE IF NOT EXISTS encashment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  code text NOT NULL,
  days numeric NOT NULL,
  amount numeric,                         -- computed from salary at approval time
  status text DEFAULT 'pending',          -- pending | approved | rejected | paid
  paid_in_month text,                     -- "2026-08" once it rode a salary expense
  decided_at timestamptz,
  decided_by text,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE encashment_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS encash_uid_status_idx ON encashment_requests(uid, status);
CREATE INDEX IF NOT EXISTS encash_pending_pay_idx ON encashment_requests(uid, employee_id) WHERE status = 'approved' AND paid_in_month IS NULL;

-- 6) SEED THE CATALOGUE FOR EVERY EXISTING BUSINESS --------------------------
-- Defaults tuned for a small Indian business. Every number is editable.
INSERT INTO leave_types (uid, code, accrual, amount, enabled, carries_forward, encashable, sort_order)
SELECT s.uid, t.code, t.accrual, t.amount, t.enabled, t.carries_forward, t.encashable, t.sort_order
FROM business_settings s
CROSS JOIN (VALUES
  ('casual',      'monthly', 1.0,  true,  false, false, 1),
  ('earned',      'monthly', 2.5,  true,  true,  true,  2),
  ('sick',        'monthly', 1.0,  true,  false, false, 3),
  ('bereavement', 'yearly',  3.0,  true,  false, false, 4),
  ('birthday',    'yearly',  1.0,  true,  false, false, 5),
  ('marriage',    'yearly',  3.0,  true,  false, false, 6),
  ('maternity',   'yearly',  0.0,  false, false, false, 7),
  ('paternity',   'yearly',  0.0,  false, false, false, 8),
  ('unpaid',      'none',    0.0,  true,  false, false, 9)
) AS t(code, accrual, amount, enabled, carries_forward, encashable, sort_order)
ON CONFLICT (uid, code) DO NOTHING;
