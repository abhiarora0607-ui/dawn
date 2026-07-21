-- ============================================================================
-- Dawn — V38: Org foundation (departments, hierarchy, scope)
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V38 code.
-- Additive and safe to re-run. Requires V31A/V31B to have run first.
-- ============================================================================

-- 1) DEPARTMENTS -------------------------------------------------------------
-- Optional by design. A two-person business never creates one and never sees
-- the field; a 200-person business needs eight. Same schema either way.
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  name text NOT NULL,
  head_employee_id uuid,              -- sees everyone in the department
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS departments_uid_idx ON departments(uid);
CREATE UNIQUE INDEX IF NOT EXISTS departments_uid_name_idx ON departments(uid, lower(name));

-- 2) HIERARCHY ---------------------------------------------------------------
-- reports_to is the single field the whole org tree is built from. Role is NOT
-- stored: someone with reports IS a lead, someone heading a department IS a
-- dept head. Deriving it kills an entire bug class — the "lead" with nobody
-- under them, the member who somehow has reports.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS reports_to uuid;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title text;   -- free text, display only

CREATE INDEX IF NOT EXISTS employees_reports_to_idx ON employees(uid, reports_to);
CREATE INDEX IF NOT EXISTS employees_department_idx ON employees(uid, department_id);

-- The existing `role` column was free text ("Delivery Head") and can't drive
-- access. Keep the data as a display job title, then let role be derived.
UPDATE employees SET job_title = role
  WHERE job_title IS NULL AND role IS NOT NULL AND role <> '';

-- 3) MIGRATION ---------------------------------------------------------------
-- Everyone reports to the owner. Safe and correct: it produces a flat tree with
-- one root, which is exactly right for every business that hasn't set up a
-- hierarchy yet. Refinement happens in the UI afterwards.
UPDATE employees e
SET reports_to = (
  SELECT o.id FROM employees o
  WHERE o.uid = e.uid AND o.is_owner = true
  LIMIT 1
)
WHERE e.reports_to IS NULL
  AND e.is_owner IS DISTINCT FROM true;

-- The owner is admin by definition.
UPDATE employees SET is_admin = true WHERE is_owner = true;

-- 4) GRANT PROVENANCE --------------------------------------------------------
-- A head may only grant permissions they themselves hold. When a permission is
-- revoked from them, everything they granted downstream must go too — otherwise
-- access outlives the authority that created it, which is how permission
-- systems rot. Recording who granted what makes that cascade possible.
ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS granted_by uuid;
ALTER TABLE employee_accounts ADD COLUMN IF NOT EXISTS granted_at timestamptz;

-- 5) INTEGRITY ---------------------------------------------------------------
-- A → B → A would make the recursive tree walk loop forever. The application
-- rejects cycles at write time; this catches the simplest case at the database.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_no_self_report;
ALTER TABLE employees ADD CONSTRAINT employees_no_self_report
  CHECK (reports_to IS NULL OR reports_to <> id);
