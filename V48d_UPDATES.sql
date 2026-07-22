-- ============================================================================
-- Dawn — V48d: demo department tagging
-- Run in Supabase BEFORE uploading the V48d code. Additive, safe to re-run.
-- ============================================================================

-- Demo departments were created without an is_demo flag, and the lifecycle map
-- didn't treat departments as demo-taggable — so "clear demo data" left them
-- behind. Repeated add/clear cycles piled up duplicate Sales and Operations
-- departments. This adds the column so demo departments can be tagged and
-- cleared like every other demo record. Real departments have it default false
-- and are never touched by a demo clear.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;
UPDATE departments SET is_demo = false WHERE is_demo IS NULL;
