-- Run in Supabase → SQL Editor → New query → Run.
-- Expenses for the finance layer. (Sales already exist from Phase 2.)

create table expenses (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  date date default now(),
  category text,
  amount numeric default 0,
  note text,
  created_at timestamptz default now()
);
create index expenses_uid_idx on expenses(uid, date desc);
alter table expenses enable row level security;
