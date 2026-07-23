# Dawn — TESTPLAN (the human hour)
The checks only a person on the live deploy can run. Do them in order; each is minutes. Screenshot anything that looks wrong — the error boundaries now print the underlying message.

## 0 · Deploy sanity (after every upload)
1. Vercel build shows "Compiled successfully"; the deployment is Current.
2. Open `/` (landing), `/signin`, `/pricing`, `/status` — all render.

## 1 · The portal (post-V55.1 confirmation)
1. `/team` → log in as any employee (demo: divya / karan / priya / rahul).
2. The home renders widgets; no "This didn't load properly" card.
3. Punch in, open Inbox, open Expenses, submit a ₹10 test claim with a photo.
4. As Karan (or you, from the dashboard Business page): approve it → check the books gained the entry once.

## 2 · Trial flow, fresh account (the oldest untested path)
1. Sign in with a NEW Google account (or clear the trial row for a test uid).
2. First dashboard load: trial banner shows 14 days; Billing page shows Trial.
3. In Supabase: exactly ONE subscriptions row for that uid; audit_log has `billing.trial_started`.
4. Reload gated pages five times fast — the plan must NOT change (V56's whole point).

## 3 · Billing surface
1. Billing page: current plan card matches Supabase truth.
2. Change plan in test mode; cancel; resume — state follows, nothing flips on its own.
3. Send me screenshots of anything inconsistent (still owed from the mandate).

## 4 · /pricing yearly toggle
Click Monthly↔Yearly — prices swap. If not, screenshot console + network.

## 5 · Demo end-to-end (owner)
Load demo data → payroll month shows 9 slips → approve one, mark paid → books entry appears. People page shows joiners/anniversaries pulse when in month.

## 6 · Email loop (Resend)
Trigger `/api/cron/lifecycle` manually (Vercel cron button) → check the send-once ledger rows; verify a welcome mail actually arrives for the fresh account from §2.

## 7 · Device pass (phones)
Open `/team` and `/dashboard` on a real Android phone: punch-in, inbox decide, expense photo attach. Note anything cramped.

## Founder chain (background)
Company registration → Razorpay KYC · Meta second submission (DM→CRM wakes after) · watch geofence flags · one real shop owner on the pricing question.
