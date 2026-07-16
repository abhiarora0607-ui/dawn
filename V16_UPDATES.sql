-- ============================================================================
-- Dawn — V16: The Identity Spine
-- Run in Supabase → SQL Editor → Run BEFORE uploading the V16 code.
-- Additive and safe to re-run.
-- ============================================================================

-- 1) INSTAGRAM ↔ BUSINESS OWNERSHIP -------------------------------------------
-- The column the DM webhook has queried since the day it was written.
ALTER TABLE ig_connections ADD COLUMN IF NOT EXISTS owner_uid text;
CREATE INDEX IF NOT EXISTS ig_connections_owner_idx ON ig_connections(owner_uid);

-- Legacy connections were implicitly owned by the uid derived from their own
-- Instagram id (lib/auth.ts fallback: uid = 'ig_' || ig_user_id). Make that
-- implicit ownership explicit. Never overwrites a real claim.
UPDATE ig_connections SET owner_uid = 'ig_' || ig_user_id WHERE owner_uid IS NULL;

-- 2) THE BUSINESS REGISTRY, BACKFILLED ----------------------------------------
-- Every uid that owns any data becomes a registered business. Signup date =
-- the earliest trace we have of it. Emails stay untouched (nullable; Postgres
-- allows many NULLs under the unique constraint).
INSERT INTO dawn_users (uid, created_at)
SELECT x.uid, MIN(x.ts)
FROM (
  SELECT uid, created_at AS ts FROM contacts
  UNION ALL SELECT uid, date        AS ts FROM sales
  UNION ALL SELECT uid, updated_at  AS ts FROM business_settings
  UNION ALL SELECT owner_uid AS uid, connected_at AS ts FROM ig_connections WHERE owner_uid IS NOT NULL
) x
WHERE x.uid IS NOT NULL
GROUP BY x.uid
ON CONFLICT (uid) DO NOTHING;
