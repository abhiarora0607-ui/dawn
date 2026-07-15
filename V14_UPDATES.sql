-- ============================================================================
-- Dawn — V14: receipt share tokens, login rate limiting, monthly score history
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V14 code.
-- Additive and safe to re-run.
-- ============================================================================

-- 1) RECEIPT SHARE TOKENS ----------------------------------------------------
-- Receipts stay permanent, login-free links for customers — forever. The URL
-- just stops using the internal order id and uses this random token instead,
-- so internal ids grant nothing and a leaked link can be regenerated.
-- The DEFAULT means every future order gets a token automatically.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS share_token text DEFAULT md5(gen_random_uuid()::text);

-- Backfill every existing order so old orders can produce working links.
UPDATE sales SET share_token = md5(gen_random_uuid()::text) WHERE share_token IS NULL;

CREATE INDEX IF NOT EXISTS sales_share_token_idx ON sales(share_token);

-- 2) LOGIN RATE LIMITING -----------------------------------------------------
-- Every failed login writes a row; too many recent rows for one identifier
-- blocks further attempts for a cooling-off window.
CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier text NOT NULL,          -- e.g. emp:<uid>:<login> or owner:<email>, plus ip
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_ident_idx ON login_attempts(identifier, created_at);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;  -- service key only

-- 3) MONTHLY SCORE HISTORY ---------------------------------------------------
-- One frozen row per employee per month, written once by the overnight job
-- when the month rolls over. Never edited — same principle as the audit trail.
CREATE TABLE IF NOT EXISTS employee_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,
  employee_id uuid NOT NULL,
  month text NOT NULL,               -- 'YYYY-MM'
  score int NOT NULL,
  rank int,
  is_top boolean DEFAULT false,
  is_bottom boolean DEFAULT false,
  breakdown jsonb DEFAULT '{}',      -- the "why": each component's points
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_scores_unique_idx ON employee_scores(uid, employee_id, month);
CREATE INDEX IF NOT EXISTS employee_scores_uid_month_idx ON employee_scores(uid, month);
ALTER TABLE employee_scores ENABLE ROW LEVEL SECURITY;  -- service key only
