-- Run in Supabase → SQL Editor → New query → Run.
-- Daily metric snapshots so Dawn can show week-over-week movement.

create table metric_snapshots (
  ig_user_id text not null,
  snap_date text not null,
  followers int,
  reach int,
  profile_visits int,
  website_clicks int,
  total_saves int,
  created_at timestamptz default now(),
  primary key (ig_user_id, snap_date)
);

alter table metric_snapshots enable row level security;
