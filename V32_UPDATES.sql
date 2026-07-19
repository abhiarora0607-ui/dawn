-- ============================================================================
-- Dawn — V32: Attendance location fixes
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V32 code.
-- Additive and safe to re-run. Requires V31A and V31B to have run first.
-- ============================================================================

-- How confident the device was about the position it reported. A punch with
-- ±1500m accuracy is not evidence of anything, and an owner reviewing a flag
-- needs to be able to tell that apart from a real 1500m walk.
ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS accuracy_m int;
