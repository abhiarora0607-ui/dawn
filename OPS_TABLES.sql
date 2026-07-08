-- Run in Supabase → SQL Editor → New query → Run.
-- Employees, recurring expenses, order fixed-cost + status.

-- Employees
create table employees (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  name text not null,
  status text default 'active',        -- active | inactive
  monthly_salary numeric default 0,
  created_at timestamptz default now()
);
create index employees_uid_idx on employees(uid);
alter table employees enable row level security;

-- Recurring expense definitions (the cron generates monthly rows from these).
create table recurring_expenses (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  source text default 'manual',        -- manual | salary
  employee_id uuid,                    -- set when source = salary
  category text,
  amount numeric default 0,
  note text,
  enabled boolean default true,
  last_generated text,                 -- 'YYYY-MM' of last generation
  created_at timestamptz default now()
);
create index recurring_uid_idx on recurring_expenses(uid);
alter table recurring_expenses enable row level security;

-- Extend expenses: link to source so we can auto-manage/delete linked rows.
alter table expenses add column if not exists source text default 'manual';   -- manual | order | salary | recurring
alter table expenses add column if not exists source_id text;                 -- order id / employee id / recurring id
alter table expenses add column if not exists recurring boolean default false;

-- Extend sales (orders): fixed cost, assigned employee, fulfillment status.
alter table sales add column if not exists fixed_cost numeric default 0;
alter table sales add column if not exists employee_id uuid;
alter table sales add column if not exists order_status text default 'Placed';  -- Placed | Processing | Shipped | Delivered
