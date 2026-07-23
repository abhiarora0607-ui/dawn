-- ============================================================================
-- Dawn — V54: home personalization
-- Run in Supabase BEFORE uploading the V54 code. Additive, safe to re-run.
-- ============================================================================

-- Each employee can pin and hide home widgets. Stored on their account row —
-- no new table for a preference. The floor (Today card) can never be hidden;
-- both the engine and the API enforce that.
ALTER TABLE employee_accounts
  ADD COLUMN IF NOT EXISTS prefs jsonb DEFAULT '{}'::jsonb;
