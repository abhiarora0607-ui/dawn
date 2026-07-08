-- Run in Supabase → SQL Editor → New query → Run.
-- v2 flow updates: per-item cost + employee on contacts.

-- Price List items get a unit cost (used to compute order expense).
alter table catalog_items add column if not exists cost numeric default 0;

-- Contacts can have a related employee.
alter table contacts add column if not exists employee_id uuid;
