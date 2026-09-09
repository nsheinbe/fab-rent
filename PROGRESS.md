# fab.rent — progress

Living status file. Update it when a phase opens, closes, or a gate clears. Phase definitions,
acceptance tests and stop conditions live in [`BUILD-PLAN.md`](BUILD-PLAN.md); this file records
only where things stand.

**Last updated:** 9 September 2026 · Phase 5 gates on this branch

---

## Where the product is

The build from the design bundle is complete. Every frame in `design/` maps to a route, the pricing
engine matches the brief's money vectors to the cent, and a rental can be driven end to end against
seeded data: search, book, pay, hand off, return, dispute, settle.

It is not yet a marketplace. Three things stand between here and one:

- No money reaches providers. Payout rows and admin actions change statuses; nothing transfers.
- Nobody is ever notified of anything. There is no email, SMS or push in the repository.
- No quality gate runs anywhere but a laptop. There is no CI.

Phases 5 through 7 close exactly those three gaps, in that order.

---

## Phases

| Phase | Scope | Status | Blocked by |
| --- | --- | --- | --- |
| 0 | Foundation: tokens, design system, schema with RLS, seed, pricing engine, state machine | **Done** | — |
| 1 | Renter surface (M01–M14, W01–W05) | **Done** | — |
| 2 | Provider console (P01–P07) | **Done** | — |
| 3 | Admin console (A01–A05) | **Done** | — |
| 4 | Hardening: Stripe cards, webhook, cron jobs, realtime, accessibility, error states, docs | **Done** | — |
| 5 | Trust the gates: CI, plus end-to-end coverage of the money paths | **Done** | — |
| 6 | Notifications: transactional email, code delivery, lifecycle messages | **Active — not started** | Email domain, secrets store |
| 7 | Real payouts: Stripe Connect onboarding, transfers, ledger reconciliation | **Active — not started** | Stripe account, legal entity and terms |
| 8 | Pilot readiness: legal pages, identity vendor, self-serve onboarding, observability | **Parked** | Scope after Phase 7 closes |

Phases 0–4 shipped in [#1](https://github.com/nsheinbe/fab-rent/pull/1), one commit each. Phase 5 is
this PR: GitHub Actions plus hermetic money-path e2e (cancel refund, claim capture, declined card).

---

## Gates

| Gate | Status | Blocks |
| --- | --- | --- |
| Stripe account with Connect enabled | **Not cleared** | Phase 7 |
| Legal entity, platform terms, rental agreement | **Not cleared** | Phase 7, Phase 8 |
| Secrets management outside `.env.local` | **Not cleared** | Phase 6, Phase 7 |
| Email sending domain with sender authentication | **Not cleared** | Phase 6 |
| Identity verification vendor | **Not cleared** | Phase 8 |
| Pilot partner with real inventory in a real city | **Not cleared** | Phase 8 |
| Design bundle | **Cleared for built surfaces** | New surfaces in Phases 6–8 have no frames |

---

## Verification

Phase 5 landed the gates. They run on every pull request and on `main` via `.github/workflows/ci.yml`
(Postgres 16 service, hermetic mock payments). A broken pricing vector fails the unit-test job under
its `describe` name (`vector 1 — pickup, no extras`, …).

| Gate | Result |
| --- | --- |
| Hermetic payments | Pass — mock allowed; Stripe without secrets throws and names the missing keys |
| Typecheck | Pass |
| Lint | Pass, two image warnings on deliberate raw tags for user uploads |
| Unit tests | 43 pass (was 35): pricing vectors, booking state, listing checks, mock recording, fail-closed Stripe |
| Production build | Pass |
| End to end | 7 pass, 5 skipped by design: existing happy paths plus cancel-in-fee-window, accept-claim capture, declined checkout |

Money-path specs assert the ledger identity (`net = gross + commission + adjustment`) and the mock
provider's recorded calls, not only the screen. They do not call live Stripe.

---

## Decisions worth remembering

Full list in `CLAUDE.md` under assumptions and deviations, numbered 1 to 44. The ones that shape
future work:

- **The data path is portable.** Kysely over `pg` against a plain connection string, with row-level
  security enforced through transaction-scoped claims and roles. The `auth` schema is an ordinary
  SQL shim. Nothing in the schema or the queries needs Supabase.
- **Supabase coupling is nine files** and is behind interfaces. The invariant in `BUILD-PLAN.md` is
  that it does not grow, so the eventual move to Neon and Auth.js stays a bounded swap.
- **Realtime is the only capability with no equivalent** on a plain Postgres host. The polling
  fallback already ships and is the supported path.
- **Every "ID verified" badge is currently decorative.** The verification provider is a mock that
  sleeps and passes. Treat it as unverified in any pilot until a vendor is contracted.
- **The demo market is fictional.** Port Maren, the Maren dollar and the frozen clock at 5 September
  2026 are seed data. A real market brings its own tax rate, currency, time zone and neighbourhoods.

---

## How to update this file

When a phase opens, set it to in progress and note the date. When it closes, mark it done and record
what the acceptance tests actually showed, including anything that had to be deferred. When a gate
clears, say who cleared it and what changed. Keep the verification table honest: if a run was
partial, say so.
