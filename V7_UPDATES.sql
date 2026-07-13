-- ============================================================================
-- Dawn — V7: default owner-employee, admin-assigned tasks/notes, demo tagging
-- Run in Supabase → SQL Editor → Run. Additive and safe.
-- ============================================================================

-- The non-deletable "owner" employee record every business gets.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false;

-- Demo tagging so "clear demo data" removes exactly what it created.
ALTER TABLE employees      ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE contacts       ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE sales          ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE catalog_items  ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE expenses       ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE tasks          ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
ALTER TABLE emp_notes      ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- Tasks/notes can be created BY the admin FOR an employee. The employee sees
-- them as their own; assigned_by tells the admin who created it.
ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS assigned_by text;
ALTER TABLE emp_notes ADD COLUMN IF NOT EXISTS assigned_by text;

-- Reason logged when an admin overrides the "customer with orders is locked" rule.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unwon_reason text;
