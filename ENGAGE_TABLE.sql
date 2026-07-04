-- Run in Supabase → SQL Editor → New query → Run.
-- Stores each account's automation settings for comments and DMs.

create table automation_settings (
  ig_user_id text primary key,
  comment_enabled boolean default false,
  comment_mode text default 'ai',          -- 'ai' or 'fixed'
  comment_fixed_reply text default '',
  dm_enabled boolean default false,
  dm_mode text default 'ai',                -- 'ai' or 'fixed'
  dm_fixed_reply text default '',
  updated_at timestamptz default now()
);

alter table automation_settings enable row level security;
