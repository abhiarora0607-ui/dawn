-- ============================================================================
-- Dawn — Employee Portal v2: messaging + ownership enforcement
-- Run in Supabase → SQL Editor → New query → Run.
-- ============================================================================

-- Conversations (one per customer contact per channel). Instagram-backed,
-- but channel is abstracted so we can add WhatsApp/SMS later.
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,                       -- business owner
  contact_id uuid,                         -- linked CRM contact (nullable)
  employee_id uuid,                        -- assigned employee
  channel text DEFAULT 'instagram',        -- instagram | whatsapp | sms
  external_id text,                        -- IG thread / sender id
  external_username text,                  -- @handle
  last_message_at timestamptz,
  last_message_preview text,
  unread_count int DEFAULT 0,
  status text DEFAULT 'open',              -- open | closed
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conv_uid_idx ON public.conversations(uid, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conv_emp_idx ON public.conversations(employee_id);
CREATE INDEX IF NOT EXISTS conv_ext_idx ON public.conversations(external_id);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations FORCE ROW LEVEL SECURITY;

-- Messages within a conversation.
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  uid text NOT NULL,
  conversation_id uuid NOT NULL,
  direction text NOT NULL,                 -- in | out
  body text,
  sender text,                             -- 'customer' | employee_id | 'owner'
  external_message_id text,
  delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msg_conv_idx ON public.messages(conversation_id, created_at);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages FORCE ROW LEVEL SECURITY;

-- Employee password self-change: add a flag column already exists
-- (must_change_password on employee_accounts). Nothing to add here.
