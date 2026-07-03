-- Run this in Supabase → SQL Editor → New query → Run.
-- Creates the table that stores connected Instagram accounts.

create table ig_connections (
  ig_user_id text primary key,
  access_token text not null,
  connected_at timestamptz default now()
);

-- Lock it down: only the server (service side) touches this.
-- No public policies = the anon/publishable key cannot read tokens.
alter table ig_connections enable row level security;
