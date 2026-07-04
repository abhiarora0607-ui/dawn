-- Run in Supabase → SQL Editor → New query → Run.
-- Stores an AI-built persona of each connected account for personalization.

create table account_persona (
  ig_user_id text primary key,
  persona_json jsonb,
  built_at timestamptz default now()
);

alter table account_persona enable row level security;
