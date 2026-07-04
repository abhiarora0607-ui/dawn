-- Run in Supabase → SQL Editor → New query → Run.
-- Stores each connected account's brand voice profile.

create table brand_voice (
  ig_user_id text primary key,
  tone text,
  audience text,
  products text,
  emoji_style text,
  dos text,
  donts text,
  faqs text,
  sample_caption text,
  updated_at timestamptz default now()
);

-- Server-only access (secret key). No public policies = safe.
alter table brand_voice enable row level security;
