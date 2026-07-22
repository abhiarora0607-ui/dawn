-- ============================================================================
-- Dawn — V48b: salary-change approval
-- Run in Supabase BEFORE uploading the V48b code. Additive, safe to re-run.
-- ============================================================================

-- A lead granted salary_edit may PROPOSE a change, but it doesn't take effect
-- on their say-so — it waits for finance or an admin to approve. This is the
-- same maker-checker split as payroll: the person proposing a number is never
-- the person who confirms it.
--
-- Finance and admin edit salary directly (their change is self-approving), so
-- they never create a row here. Only a lead's proposal does.
CREATE TABLE IF NOT EXISTS salary_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,          -- whose salary
  current_salary numeric,             -- what it was when proposed, for the record
  proposed_salary numeric NOT NULL,
  reason text,
  requested_by uuid NOT NULL,         -- the lead who proposed
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE salary_change_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS salary_change_uid_idx ON salary_change_requests(uid, status);

ALTER TABLE salary_change_requests DROP CONSTRAINT IF EXISTS salary_change_status_check;
ALTER TABLE salary_change_requests ADD CONSTRAINT salary_change_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));
