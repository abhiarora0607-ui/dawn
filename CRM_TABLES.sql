-- Run in Supabase → SQL Editor → New query → Run.
-- Contacts, activity timeline, and sales for the mini CRM.

create table contacts (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  name text not null,
  phone text,
  email text,
  instagram_handle text,
  source text,                             -- Instagram DM / WhatsApp / Referral / Walk-in / Website / Other
  stage text default 'New Lead',
  tags jsonb default '[]',
  interested_item_ids jsonb default '[]',
  follow_up_date date,
  notes text,
  created_at timestamptz default now()
);
create index contacts_uid_idx on contacts(uid, created_at desc);
alter table contacts enable row level security;

create table activities (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  contact_id uuid not null,
  type text not null,                      -- note | stage_change | sale | attachment
  content text,
  meta jsonb default '{}',
  created_at timestamptz default now()
);
create index activities_contact_idx on activities(contact_id, created_at desc);
alter table activities enable row level security;

create table sales (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  contact_id uuid,
  items jsonb default '[]',                -- [{itemId,name,qty,unitPrice}]
  subtotal numeric default 0,
  discount numeric default 0,
  total numeric default 0,
  amount_paid numeric default 0,
  balance numeric default 0,
  payment_method text,
  status text default 'paid',              -- paid | partial | pending
  payments jsonb default '[]',            -- [{amount,date,method}]
  notes text,
  date timestamptz default now()
);
create index sales_uid_idx on sales(uid, date desc);
alter table sales enable row level security;
