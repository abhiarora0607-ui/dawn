# DAWN — Executive Product Audit Report (V57)
23 July 2026 · Auditor: the founding engineer, against the live V56 codebase · Method: full-tree evidence sweeps, live-gate construction, reintroduction proofs. Nothing scored from memory.

## 0 · Inventory
102 API routes · 54 pages · 44 components (2 dead ones deleted) · 44 libs · 18 rule suites (~562 rules) · 31 invariants · 11 layout gates · 33,195 LOC (app+lib+components). Largest files: app/team/page.tsx 1,118 (retires in V60), attendance page 691, payroll page/route 487/448.

## 1 · Scores (0–100, evidence-tied)
| Dimension | Score | Grounding |
|---|---|---|
| Product Health | **78** | Deep, working feature set across CRM+IG+HR+finance; two crash-class live bugs this month (both root-caused, fixed, gate-hardened); billing arc mid-flight. |
| Engineering Health | **84** | 562 rules, 31 invariants, 11 gates, 44-component import sweep — every check reintroduction-proven. Debt: 59× duplicated `H()` helper; dual API surfaces (by design until V60–62); legacy raw-fetch pages (failure-hardened this version). |
| Completeness | **74** | BACKLOG.md unbuilt list; portal unification and billing V58–59 pending. |
| UI/UX | **78** | One design system throughout; 9 pages silently swallowed failures — fixed with uniform error+retry; two shells until V60. |
| AI Quality | **80** | Central prompt spine + account context at 8/9 sites; parseAiJson everywhere; calendar still thin (V63); no output evals. |
| Security | **82** | Verified: zero service-key exposure in any client file; all three auth surfaces (owner 90d, employee 12h, operator) carry httpOnly+secure+sameSite and rate limits; maker-checker on every money path. Gaps: no 2FA; single service-role key; no session revocation list. |
| Performance | **76** | All 38 growth-table fetch sites now bounded, keyed, or carry a named full-scan justification (gate-enforced); minimal-column selects standard. Gaps: no pagination on contacts/expenses big views (tagged for V61); no caching layer; free-tier ceilings are the real limit. |

**Production readiness:** ready for a first paying cohort after V58–59 (billing complete) **plus one clean human TESTPLAN pass**; enterprise-grade claim earned at V62 (one-app) and V66 (re-score).

## 2 · Fixed in this audit (quick wins, shipped)
- 9 pages that fetched with no failure treatment (6 dashboard, 2 operator, pricing): uniform error state + retry; operator/product's forever-spinner now breaks on failure.
- 2 dead components deleted (ApiGate, WaitlistForm).
- 1 unbounded conversation fetch capped (messages limit=500).
- 38 growth-table fetch sites reviewed: keyed-exempt, capped, or tagged `// full-scan: <reason>` — now a permanent gate.
- Gate 11 taught the house loading vocabulary (busy/Loader2), eliminating false positives without weakening the rule.

## 3 · The audit audited its own auditors (highest-value finding)
Three of the new checks initially **passed while checking nothing** — each caught only by its reintroduction proof, each a general lesson:
1. **Tenant-filter regex**: `[a-z_]*id=eq.` matched `uid=eq.` on every fetch → gate vacuous. Fix: boundary + named key columns. *Lesson: exemption regexes must name their nouns.*
2. **Template-literal mangling**: sweep code inserted into the smoke harness's outer template literal was silently truncated by its own backticks; stale `.smoke-tmp` staging then masked the crash. *Lessons: generated code needs concat-safe insertion; staging caches must be busted in proofs.*
3. **walk() extension filter**: the file-walker collected only `.tsx`, so the API-facing gate iterated zero files. Once fixed, the live gate found **18 additional unbounded sites** my manual grep sweep had missed (its `-v select=id` filter accidentally excluded `select=id,name,…`). *Lesson: a checker's file census is part of the check.*
Every gate in the repo now has a demonstrated failure mode. A green run means something.

## 4 · Findings by priority
**Critical (none open).** The two criticals found this cycle — the /team hooks crash (V55.1) and the billing silent plan-reset (V56) — are fixed with invariants 30–31 and hardened gates.
**High:** portal shell duality (V60–62, planned); billing lifecycle/history absent (V58, planned); pagination on the two big list APIs (V61); `H()` ×59 → lib/http.ts (fold into V60–62 file touches, not a big-bang).
**Medium:** calendar prompt context (V63); no AI output evals (V63 adds spot-check rules); raw-fetch pages predate useApi (retire naturally in V60–62); events/audit tables have no retention policy (add a cron trim in V66); suggestions API reads `select=*` over all contacts (trim fields in V63).
**Low:** three `any`-typed sort callbacks in operator/product; docs/help absent (V65); operator digest absent (V64).

## 5 · Suggested redesigns (unchanged from the master plan, now evidence-backed)
One-app portal (V60–62) — the 1,118-line /team page and the duplicated team/* API layer are the measured cost of the second shell. Payments adapter seam (V59). Nav-registry generalization of the V51 composition engine (V60).

## 6 · Decisions for the founder
1. **Dept-head approval authority**: recommendation — keep the line-manager standard; the inert-authority detector plus admin coverage handles the real risk. Revisit only if a real org asks.
2. **Push notifications**: skip; email + in-app cover the jobs. 3. **Tax/Vendor/Hiring/Perf-review modules**: defer until pulled.

## 7 · Scalability concerns (honest ceilings)
Free-tier Supabase pooling is the binding constraint before ~hundreds of active businesses; the V56 read-only rule removed its worst failure mode (state corruption on blips). Per-request loadOrg costs 2 fetches across team APIs — acceptable now, collapses naturally in V60's resolveActor. The 1k-business simulation re-runs in V66 over all post-V22 tables.

## 8 · Roadmap confirmation
V58–V66 scopes stand as planned, with V61 explicitly absorbing pagination and lib/http.ts consolidation, V63 absorbing the suggestions-select trim, V66 absorbing events/audit retention. No version count change: **the estimate holds at 11.**
