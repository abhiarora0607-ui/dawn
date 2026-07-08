-- Run in Supabase → SQL Editor → New query → Run.
-- v3: employee details, GST, contact-employee requirement.

alter table employees add column if not exists joining_date date;
alter table employees add column if not exists phone text;
alter table employees add column if not exists role text;
alter table employees add column if not exists email text;

alter table business_settings add column if not exists gst_number text;
alter table storefront add column if not exists gst_number text;
