-- Run in Supabase → SQL Editor → New query → Run.
-- Price List / Catalog for the business layer.

create table catalog_items (
  id uuid default gen_random_uuid() primary key,
  uid text not null,                       -- owner (dawn_uid)
  type text default 'product',             -- 'product' | 'service'
  name text not null,
  description text,
  category text,
  price numeric,
  compare_at_price numeric,
  unit text default 'per item',            -- per item/hour/session/day/month/project/custom
  sku text,
  images jsonb default '[]',
  variants jsonb default '[]',             -- [{name, price}]
  is_active boolean default true,
  is_public boolean default true,
  sort_order int default 0,
  created_at timestamptz default now()
);

create index catalog_uid_idx on catalog_items(uid, sort_order);
alter table catalog_items enable row level security;

-- Public storefront settings per owner (for the shareable price list page).
create table storefront (
  uid text primary key,
  slug text unique,                        -- public url handle
  business_name text,
  logo_url text,
  phone text,
  whatsapp text,
  currency text default '₹',
  updated_at timestamptz default now()
);

alter table storefront enable row level security;
