-- Run in Supabase → SQL Editor → New query → Run.
-- Stores dismissed/accepted suggestion state (suggestions themselves are
-- computed live from CRM data; this table just tracks what's been actioned).

create table suggestion_state (
  id text primary key,          -- deterministic id: type + entity
  uid text not null,
  status text default 'open',   -- open | accepted | dismissed
  updated_at timestamptz default now()
);
alter table suggestion_state enable row level security;

-- Attachments on contacts (payment screenshots etc.) — needed for the
-- payment-proof suggestion. Stores a data URL or external URL.
create table attachments (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  contact_id uuid not null,
  file_url text,
  kind text default 'other',    -- payment_screenshot | other
  created_at timestamptz default now()
);
create index attachments_contact_idx on attachments(contact_id);
alter table attachments enable row level security;
