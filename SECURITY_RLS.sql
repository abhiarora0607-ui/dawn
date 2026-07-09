-- ============================================================================
-- Dawn — Security hardening: Row-Level Security default-deny net.
-- Run in Supabase → SQL Editor → New query → Run.
--
-- HOW DAWN'S SECURITY WORKS (read this):
--   • Dawn uses its OWN cookie identity, not Supabase Auth.
--   • All data access is server-side using the SERVICE key, which bypasses
--     RLS by design. The application (lib/tenant.ts) is the access boundary.
--   • These policies are DEFENSE IN DEPTH: they ensure that the public/anon
--     key (anything client-side or a leaked anon key) can read/write NOTHING
--     on tenant tables. The service key continues to work server-side.
--
-- Net effect: enabling RLS with NO permissive anon policy = default deny for
-- anon. Service role is unaffected. This is exactly what we want.
-- ============================================================================

-- Enable RLS on every tenant table (id empty policy set = anon denied).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contacts','activities','sales','catalog_items','expenses','employees',
    'recurring_expenses','attachments','suggestion_state','business_settings',
    'storefront','brand_voice','account_persona','store_profile','saved_content',
    'scheduled_actions','metric_snapshots','brief_cache','automation_settings',
    'ig_connections'
  ]
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE IF EXISTS public.%I FORCE ROW LEVEL SECURITY;', t);
    -- Drop any stale policies so we start from a clean default-deny.
    EXECUTE format('DROP POLICY IF EXISTS %I_anon_deny ON public.%I;', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- PUBLIC READ EXCEPTIONS
-- The public price list (/p/[slug]) is fetched SERVER-SIDE with the service
-- key, so it needs NO anon policy. We intentionally add NO anon-readable
-- policies anywhere. If you ever move the public page to client-side fetch,
-- add a narrow SELECT policy here — not before.
-- ---------------------------------------------------------------------------

-- Waitlist: insert-only for anon (marketing signups), no read.
ALTER TABLE IF EXISTS public.waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_insert_anon ON public.waitlist;
CREATE POLICY waitlist_insert_anon ON public.waitlist
  FOR INSERT TO anon WITH CHECK (true);

-- Verify (optional): list tables and whether RLS is on.
-- SELECT relname, relrowsecurity FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--   ORDER BY relname;

-- ============================================================================
-- AUDIT LOG — records important actions (security + Phase 2 employee portal).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,                    -- business owner
  actor text,                           -- who did it (owner or employee id)
  actor_type text DEFAULT 'owner',      -- owner | employee | system
  action text NOT NULL,                 -- e.g. 'contact.delete', 'order.create'
  entity text,                          -- table/entity affected
  entity_id text,
  meta jsonb DEFAULT '{}',
  ip text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_uid_idx ON public.audit_log(uid, created_at DESC);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;
