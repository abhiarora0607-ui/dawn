-- ============================================================================
-- Dawn — V49: typed bonuses
-- Run in Supabase BEFORE uploading the V49 code. Additive, safe to re-run.
-- ============================================================================

-- Bonuses were all generic — an amount and a free-text reason. V49 gives them a
-- kind, so a festival gift, a performance award, and a plain cash bonus are
-- distinguishable on the payslip and in reports.
--
-- Note: a "leave gift" is NOT stored here. Gifting leave grants earned-leave
-- days through leave_grants, the same path as any other granted leave — it
-- never becomes a cash line. Only cash-bearing bonuses live in this table.
ALTER TABLE bonus_requests ADD COLUMN IF NOT EXISTS kind text DEFAULT 'cash';
UPDATE bonus_requests SET kind = 'cash' WHERE kind IS NULL;

ALTER TABLE bonus_requests DROP CONSTRAINT IF EXISTS bonus_kind_check;
ALTER TABLE bonus_requests ADD CONSTRAINT bonus_kind_check
  CHECK (kind IN ('cash', 'gift', 'performance'));
