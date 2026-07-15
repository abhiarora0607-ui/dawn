-- ============================================================================
-- Dawn — V15: Operator Console (part 1)
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V15 code.
-- ============================================================================

-- When each business last did anything — powers Active/Cooling/Churning.
-- Starts tracking from deployment; older accounts show "no signal yet" until
-- they next use the app.
ALTER TABLE dawn_users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- Your private notes about each customer (used from V16's detail page, table
-- created now so there's only one SQL step).
CREATE TABLE IF NOT EXISTS operator_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  target_uid text NOT NULL,          -- which business the note is about
  note text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_notes_target_idx ON operator_notes(target_uid, created_at DESC);
ALTER TABLE operator_notes ENABLE ROW LEVEL SECURITY;  -- service key only
