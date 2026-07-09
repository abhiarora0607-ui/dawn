-- ============================================================================
-- Dawn — Phase 2: Employee Portal + RBAC
-- Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- Employee login credentials + permissions. Separate from the employees
-- table so we can add/remove login access without touching the HR record.
CREATE TABLE IF NOT EXISTS public.employee_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,                       -- owner (business) uid
  employee_id uuid NOT NULL,               -- FK → employees.id
  login_id text UNIQUE NOT NULL,           -- unique login handle
  password_hash text NOT NULL,             -- scrypt hash (see lib/password.ts)
  password_salt text NOT NULL,
  active boolean DEFAULT true,             -- account enabled?
  permissions jsonb DEFAULT '[]',          -- ["leads","orders",...]
  must_change_password boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emp_accounts_uid_idx ON public.employee_accounts(uid);
CREATE INDEX IF NOT EXISTS emp_accounts_login_idx ON public.employee_accounts(login_id);
ALTER TABLE public.employee_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_accounts FORCE ROW LEVEL SECURITY;

-- Employee login sessions (opaque server-side tokens).
CREATE TABLE IF NOT EXISTS public.employee_sessions (
  token text PRIMARY KEY,
  uid text NOT NULL,                       -- owner uid (tenant scope)
  employee_id uuid NOT NULL,
  account_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emp_sessions_exp_idx ON public.employee_sessions(expires_at);
ALTER TABLE public.employee_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_sessions FORCE ROW LEVEL SECURITY;

-- Login history (security + admin visibility).
CREATE TABLE IF NOT EXISTS public.login_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,
  account_id uuid,
  login_id text,
  success boolean DEFAULT true,
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_hist_uid_idx ON public.login_history(uid, created_at DESC);
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history FORCE ROW LEVEL SECURITY;
