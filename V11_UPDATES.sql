-- ============================================================================
-- Dawn — V11: order cancellation (admin-only, with payment reconciliation)
-- Run in Supabase → SQL Editor → Run. Additive and safe.
-- ============================================================================

-- Why the order was cancelled, and what happened to any money already paid.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_reason text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
-- payment_disposition: 'refunded' | 'retained' | 'none' (nothing was paid)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_disposition text;
