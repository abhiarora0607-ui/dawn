-- Run in Supabase → SQL Editor → New query → Run.
-- Business settings/profile. (storefront already has some of this; this is
-- the fuller settings record.)

create table business_settings (
  uid text primary key,
  business_name text,
  logo_url text,
  phone text,
  whatsapp text,
  address text,
  currency text default '₹',
  business_type text,
  stage_names jsonb default '["New Lead","Contacted","Negotiating","Customer (Won)","Lost"]',
  updated_at timestamptz default now()
);
alter table business_settings enable row level security;

-- ============================================================
-- STORAGE SETUP (do this in the Supabase dashboard, not SQL):
-- 1. Go to Storage → Create a new bucket named:  dawn-uploads
-- 2. Make it PUBLIC (so images show on the public price list & receipts)
-- That's it. The app uploads via the API using your service key.
-- ============================================================
