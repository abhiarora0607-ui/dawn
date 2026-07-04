-- Run in Supabase → SQL Editor → New query → Run.
-- Stores content the user saves (captions, ideas, hashtags).

create table saved_content (
  id uuid default gen_random_uuid() primary key,
  ig_user_id text not null,
  kind text not null,          -- 'caption' | 'idea' | 'hashtags'
  title text,
  body text,
  meta jsonb,
  created_at timestamptz default now()
);

create index saved_content_user_idx on saved_content(ig_user_id, created_at desc);
alter table saved_content enable row level security;
-- Run in Supabase → SQL Editor → New query → Run.
-- Caches the daily briefing so it's stable through the day.

create table brief_cache (
  ig_user_id text not null,
  brief_date text not null,
  payload jsonb,
  created_at timestamptz default now(),
  primary key (ig_user_id, brief_date)
);

alter table brief_cache enable row level security;
