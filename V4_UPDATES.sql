-- ============================================================================
-- Dawn — V4: fixed stages support, Lost reasons, Tasks & Notes (real modules)
-- Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- Lost reason (required when a lead is marked Lost).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lost_reason text;

-- Tasks: real task/follow-up management for employees (and owner later).
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,
  employee_id uuid,                 -- who owns the task (null = owner's own)
  contact_id uuid,                  -- optional linked lead/customer
  title text NOT NULL,
  due_date date,
  done boolean DEFAULT false,
  done_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_uid_emp_idx ON public.tasks(uid, employee_id, done, due_date);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;

-- Notes: simple personal notes for employees.
CREATE TABLE IF NOT EXISTS public.emp_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  body text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emp_notes_idx ON public.emp_notes(uid, employee_id, updated_at DESC);
ALTER TABLE public.emp_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emp_notes FORCE ROW LEVEL SECURITY;
