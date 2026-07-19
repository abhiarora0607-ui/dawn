-- ============================================================================
-- Dawn — V31a: Attendance
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V31a code.
-- Additive and safe to re-run.
-- ============================================================================

-- 1) ATTENDANCE SETTINGS (one row per business) ------------------------------
-- Every rule the owner controls. Thresholds are numbers, not constants in
-- code, so a shop with a 6-hour day works exactly as well as a 9-hour one.
CREATE TABLE IF NOT EXISTS attendance_settings (
  uid text PRIMARY KEY,
  enabled boolean DEFAULT true,
  shop_lat numeric,                       -- NULL until the owner sets a location
  shop_lng numeric,
  geofence_radius_m int DEFAULT 150,
  enforce_geofence boolean DEFAULT false, -- false = record & flag (recommended)
  required_hours numeric DEFAULT 8,       -- business default; per-employee override wins
  half_day_pct int DEFAULT 50,            -- < this  → full-day leave
  full_day_pct int DEFAULT 100,           -- >= this → full day; between → half day
  regularization_quota int DEFAULT 3,     -- per employee per calendar month
  regularization_back_days int DEFAULT 10,
  default_weekly_offs int[] DEFAULT ARRAY[0], -- 0=Sun … 6=Sat
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE attendance_settings ENABLE ROW LEVEL SECURITY;

-- 2) EMPLOYEE-LEVEL ATTENDANCE FIELDS ----------------------------------------
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_start time;          -- NULL = no late tracking
ALTER TABLE employees ADD COLUMN IF NOT EXISTS shift_end time;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS required_hours numeric;    -- NULL = use business default
ALTER TABLE employees ADD COLUMN IF NOT EXISTS weekly_offs int[];         -- NULL = use business default
ALTER TABLE employees ADD COLUMN IF NOT EXISTS remote_permanent boolean DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth date;        -- needed by birthday leave (V31b)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS attendance_exempt boolean DEFAULT false; -- owners don't punch

-- 3) RAW PUNCHES -------------------------------------------------------------
-- One row per in/out pair. Several rows per day are normal and expected:
-- 1:00pm–3:00pm plus 4:00pm–5:00pm is three hours, not two separate days.
CREATE TABLE IF NOT EXISTS attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,                -- IST calendar date, not UTC
  punch_in timestamptz,
  punch_out timestamptz,
  in_lat numeric, in_lng numeric,
  out_lat numeric, out_lng numeric,
  within_fence boolean,                   -- NULL = location unavailable, never a block
  distance_m int,
  source text DEFAULT 'punch',            -- punch | regularized | owner
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS att_logs_emp_date_idx ON attendance_logs(uid, employee_id, work_date);
CREATE INDEX IF NOT EXISTS att_logs_open_idx ON attendance_logs(uid, employee_id) WHERE punch_out IS NULL;

-- 4) DERIVED DAYS ------------------------------------------------------------
-- The answer for one person on one date. Recomputed whenever punches change,
-- so this is a cache of truth, never a second source of it.
CREATE TABLE IF NOT EXISTS attendance_days (
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  worked_minutes int DEFAULT 0,
  classification text,                    -- full | half | absent | weekly_off | holiday | leave | missing_punch_out | not_joined
  leave_code text,                        -- set when classification = leave (V31b)
  late_minutes int DEFAULT 0,
  flagged boolean DEFAULT false,
  flag_reason text,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (uid, employee_id, work_date)
);
ALTER TABLE attendance_days ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS att_days_date_idx ON attendance_days(uid, work_date);

-- 5) REMOTE GRANTS -----------------------------------------------------------
-- "Work from anywhere" for a single day or a range. Permanent remote lives on
-- the employee row; this is for the one-off.
CREATE TABLE IF NOT EXISTS remote_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE remote_grants ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS remote_grants_idx ON remote_grants(uid, employee_id, from_date, to_date);

-- 6) HOLIDAYS ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS holidays_uid_date_idx ON holidays(uid, holiday_date);

-- 7) REGULARIZATION REQUESTS -------------------------------------------------
-- People forget to punch. This is the honest correction path: the employee
-- proposes the real times with a reason, the owner approves, and the original
-- record stays visible as history.
CREATE TABLE IF NOT EXISTS regularization_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  proposed_logs jsonb NOT NULL,           -- [{in:"09:15", out:"18:00"}, …]
  reason text NOT NULL,
  status text DEFAULT 'pending',          -- pending | approved | rejected
  decided_at timestamptz,
  decided_by text,
  decision_note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE regularization_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS regreq_uid_status_idx ON regularization_requests(uid, status, created_at);
CREATE INDEX IF NOT EXISTS regreq_emp_month_idx ON regularization_requests(uid, employee_id, created_at);

-- 8) PER-EMPLOYEE EXTRA QUOTA ------------------------------------------------
-- Base quota is business-wide; this adds on top for a specific person.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS extra_regularizations int DEFAULT 0;

-- 9) SEED SETTINGS FOR EXISTING BUSINESSES -----------------------------------
INSERT INTO attendance_settings (uid)
SELECT uid FROM business_settings
ON CONFLICT (uid) DO NOTHING;

-- 10) OWNERS ARE EXEMPT BY DEFAULT -------------------------------------------
UPDATE employees SET attendance_exempt = true WHERE is_owner = true AND attendance_exempt IS NOT true;
