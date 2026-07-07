-- Run in Supabase → SQL Editor → New query → Run.
-- Scheduled/queued posts and drafted actions the user approves inside Dawn.

create table scheduled_actions (
  id uuid default gen_random_uuid() primary key,
  ig_user_id text not null,
  kind text not null,              -- 'post' | 'dm_draft' | 'comment_draft'
  status text default 'queued',    -- 'queued' | 'done' | 'cancelled'
  scheduled_for timestamptz,
  title text,
  body text,                       -- caption / draft text
  meta jsonb,                      -- hashtags, image ref, target, etc.
  created_at timestamptz default now()
);

create index scheduled_user_idx on scheduled_actions(ig_user_id, created_at desc);
alter table scheduled_actions enable row level security;
