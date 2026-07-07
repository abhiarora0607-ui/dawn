-- Run in Supabase → SQL Editor → New query → Run.
-- Unified identity + magic-link auth for the business layer.

-- A Dawn user. Identity is either linked to an Instagram account or an email.
create table dawn_users (
  uid text primary key,              -- stable Dawn user id
  email text unique,
  ig_user_id text,                   -- linked IG account, if connected
  created_at timestamptz default now()
);

-- Magic link tokens (short-lived, single-use).
create table magic_tokens (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

alter table dawn_users enable row level security;
alter table magic_tokens enable row level security;
