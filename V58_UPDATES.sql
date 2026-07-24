-- ============================================================================
-- Dawn — V58: subscription lifecycle (scheduled changes + full history)
-- Run in Supabase BEFORE uploading the V58 code. Additive, safe to re-run.
-- ============================================================================

-- Scheduled plan changes: a downgrade (or same-price/cycle switch) never
-- shrinks access mid-cycle — it waits here until period end, visibly, with
-- an undo. Upgrades don't use these columns; they apply immediately.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scheduled_plan_id uuid;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scheduled_cycle text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS effective_at timestamptz;

-- The audit trail the V56 bug proved necessary: EVERY subscription write —
-- owner, operator, cron, or the system's own trial creation — records who
-- did what, from where to where, and why. No subscription state ever again
-- changes "from nowhere".
CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,               -- owner | operator | cron | system
  action text NOT NULL,              -- trial_started | plan_changed | change_scheduled | schedule_undone | schedule_applied | cancelled | resumed | operator_*
  from_plan_id uuid,
  to_plan_id uuid,
  from_status text,
  to_status text,
  cycle text,
  reason text,
  meta jsonb
);
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS sub_events_uid_idx ON subscription_events(uid, at DESC);
