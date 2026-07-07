-- Run in Supabase → SQL Editor → New query → Run.
-- Store profile: the D2C context that makes briefings revenue-aware.

create table store_profile (
  ig_user_id text primary key,
  store_url text,
  products text,          -- catalog: names, price points, hero products
  promos text,            -- current offers, launches, sales
  goals text,             -- e.g. "grow DTC sales", "launch new line in Aug"
  avg_order_value text,
  winning_hooks text,     -- past hooks/angles that converted
  updated_at timestamptz default now()
);

alter table store_profile enable row level security;
