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
