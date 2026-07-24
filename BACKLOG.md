# Dawn — BACKLOG (tracked as of V57)
Verified against code, 23 Jul 2026. Sections: what's queued, what's unbuilt, what's declined-until-asked, what's on the founder.

## Queued (the master plan V58–V66)
V58 lifecycle (scheduled plan changes + subscription_events) · V59 billing dashboard + payments adapter · V60–62 portal unification (one app shell, actor-scoped) · V63 AI pass (calendar context enrichment; envelope audit) · V64 CRM completions · V65 business completions · V66 hardening + readiness re-score.

## Unbuilt, verified absent
- Duplicate contact merge · bulk actions on contacts (V64)
- Recurring/subscription orders (V64)
- HR leave-calendar month view (V64, in-shell)
- Invoice document/ticket design (V65) — sequential FY numbering ALREADY exists (verified V58); only the printable doc remains
- Referral give/get program (V65)
- Automated export-to-storage backups (V65)
- In-app help/docs (V65)
- Operator weekly digest (V64)
- Push notifications — DECISION: default skip (email + in-app exist)
- Pagination on contacts + expenses big views (V61; tagged `paginate in V61`)
- 59× duplicated `H()` header helper → one lib/http.ts (fold into V60–62 touches)

## Declined until a real user asks
Rep "my numbers" twin card · Tax / Vendor-payments / Hiring / Performance-review modules · Hindi/i18n · agency mode · multi-currency · native apps · third-party analytics · business switcher.

## Open decision
Department-head approval authority (vs line-manager standard). Recommendation in docs/AUDIT-V57.md §Decisions.

## On the founder (see TESTPLAN.md)
Deploy + confirm `/team` · V53+V54 SQL · billing screenshots · live walks (demo e2e, fresh-account trial, /pricing toggle) · Razorpay KYC chain · Meta second submission · geofence flag watch · one real user.
