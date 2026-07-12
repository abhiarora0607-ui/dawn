-- ============================================================================
-- Dawn — V5: won-without-order reasons
-- Run in Supabase → SQL Editor → Run. Additive and safe.
-- ============================================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS won_reason text;
