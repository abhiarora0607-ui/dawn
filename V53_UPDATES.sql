-- ============================================================================
-- Dawn — V53: expense claims from the portal
-- Run in Supabase BEFORE uploading the V53 code. Additive, safe to re-run.
-- ============================================================================

-- Any employee can claim an expense (auto fare, client lunch, supplies);
-- finance or an admin approves it; and ONLY on approval does it become an
-- entry in the books. The worldwide flow: submit → approve → post. The
-- submitter can never approve their own claim, and the posted books entry is
-- remembered on the claim so an approval can never double-post.
CREATE TABLE IF NOT EXISTS expense_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL,
  employee_id uuid NOT NULL,          -- who's claiming
  amount numeric NOT NULL,
  category text NOT NULL,
  note text,
  expense_date date NOT NULL,
  receipt_url text,                   -- optional link to a receipt photo
  status text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  posted_expense_id uuid,             -- the books entry, set only on approve
  created_at timestamptz DEFAULT now()
);
ALTER TABLE expense_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS expense_req_uid_idx ON expense_requests(uid, status);

ALTER TABLE expense_requests DROP CONSTRAINT IF EXISTS expense_req_status_check;
ALTER TABLE expense_requests ADD CONSTRAINT expense_req_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));
