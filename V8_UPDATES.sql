-- ============================================================================
-- Dawn — V8: demo-data columns + expense provenance (required for the
-- "keep past salaries, stop future ones" rule and for demo seed/clear).
-- Run in Supabase → SQL Editor → Run. Additive and safe — run it BEFORE
-- using "Add demo data".
-- ============================================================================

-- Expense provenance. The cron writes these; without them, salary expenses
-- can't be traced back to an employee and the delete rule can't find them.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS source_id text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring boolean DEFAULT false;

-- V7 columns, repeated here so a single file gets you fully up to date.
ALTER TABLE employees      ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false;
ALTER TABLE employees      ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE contacts       ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE sales          ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE catalog_items  ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE expenses       ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE tasks          ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE emp_notes      ADD COLUMN IF NOT EXISTS is_demo  boolean DEFAULT false;
ALTER TABLE tasks          ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE emp_notes      ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE contacts       ADD COLUMN IF NOT EXISTS unwon_reason text;
ALTER TABLE contacts       ADD COLUMN IF NOT EXISTS won_reason   text;
ALTER TABLE contacts       ADD COLUMN IF NOT EXISTS lost_reason  text;

-- Backfill: assign any orphaned records to the owner-employee so nothing is
-- left unassigned now that assignment is mandatory. Safe to re-run.
INSERT INTO employees (uid, name, status, is_owner, role, monthly_salary)
SELECT DISTINCT c.uid, 'Owner', 'active', true, 'Owner', 0
FROM contacts c
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.uid = c.uid AND e.is_owner = true);

UPDATE contacts c SET employee_id = e.id
FROM employees e
WHERE e.uid = c.uid AND e.is_owner = true AND c.employee_id IS NULL;

UPDATE sales s SET employee_id = e.id
FROM employees e
WHERE e.uid = s.uid AND e.is_owner = true AND s.employee_id IS NULL;
