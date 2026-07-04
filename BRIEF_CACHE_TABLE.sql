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
