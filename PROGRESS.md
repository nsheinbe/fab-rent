# fab.rent — progress

Living status file. Update it when a phase opens, closes, or a gate clears. Phase definitions,
acceptance tests and stop conditions live in [`BUILD-PLAN.md`](BUILD-PLAN.md); this file records
only where things stand.

**Last updated:** 10 September 2026 · Phase 6 notifications on this branch

---

## Where the product is

The build from the design bundle is complete. Every frame in `design/` maps to a route, the pricing
engine matches the brief's money vectors to the cent, and a rental can be driven end to end against
seeded data: search, book, pay, hand off, return, dispute, settle.

It is not yet a marketplace. One thing still stands between here and one:

- No money reaches providers. Payout rows and admin actions change statuses; nothing transfers.

Two of the three gaps named when this file was written are closed: CI runs every gate on every pull
request (Phase 5), and every state change the design shows a person being told about now sends an
email through a recorded, idempotent outbox (Phase 6). Phase 7 closes the last one.

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
| 6 | Notifications: transactional email, code delivery, lifecycle messages | **Done** (opened and closed 10 Sep 2026, this PR) | Live sending waits on the email domain + secrets store; the code path is complete and fail-closed |
| 7 | Real payouts: Stripe Connect onboarding, transfers, ledger reconciliation | **Active — not started** | Stripe account, legal entity and terms |
| 8 | Pilot readiness: legal pages, identity vendor, self-serve onboarding, observability | **Parked** | Scope after Phase 7 closes |

Phases 0–4 shipped in [#1](https://github.com/nsheinbe/fab-rent/pull/1), one commit each. Phase 5
([#3](https://github.com/nsheinbe/fab-rent/pull/3)) added GitHub Actions plus hermetic money-path e2e.
Phase 6 is this PR: `NotificationProvider` (console + Resend), sign-in codes by email, lifecycle
messages hooked into `transitionBooking` and the money paths, delivery records, per-message opt-outs.

---

## Gates

| Gate | Status | Blocks |
| --- | --- | --- |
| Stripe account with Connect enabled | **Not cleared** | Phase 7 |
| Legal entity, platform terms, rental agreement | **Not cleared** | Phase 7, Phase 8 |
| Secrets management outside `.env.local` | **Not cleared** | Live email (Phase 6 code is fail-closed until `RESEND_API_KEY` + `NOTIFICATIONS_FROM` exist somewhere safe), Phase 7 |
| Email sending domain with sender authentication | **Not cleared** | Live email. The adapter is written and unit-tested against a mocked API; nothing has been sent to a real inbox. Needs a domain with SPF/DKIM and a decision on the reply-to address (`NOTIFICATIONS_REPLY_TO`). |
| Identity verification vendor | **Not cleared** | Phase 8 |
| Pilot partner with real inventory in a real city | **Not cleared** | Phase 8 |
| Design bundle | **Cleared for built surfaces** | New surfaces in Phases 6–8 have no frames |

---

## Verification

The gates from Phase 5 run on every pull request and on `main` via `.github/workflows/ci.yml`
(Postgres 16 service, hermetic mock payments, console notifications). A broken pricing vector fails
the unit-test job under its `describe` name.

| Gate | Result on this branch |
| --- | --- |
| Hermetic payments + notifications | Pass — mock and console allowed; Stripe or Resend without secrets throw and name the missing keys; both refused in CI unless `HERMETIC=0` |
| Typecheck | Pass |
| Lint | Pass, the same two image warnings on deliberate raw tags for user uploads |
| Unit tests | 63 pass (was 43): + catalogue (every transition has a plan, money/dispute never optional), opt-out rules, every template for both parties, console adapter never calls `fetch`, Resend adapter against a mocked API, fail-closed config |
| Production build | Pass |
| End to end | 12 pass, 10 skipped by project (mobile runs the phone-first flows, desktop the money paths, console and notification specs) |

### Phase 6 acceptance tests (BUILD-PLAN)

| Acceptance test | How it is verified | Result |
| --- | --- | --- |
| Signing in with an email that is not a seeded demo account sends exactly one code and no code appears in the page | `tests/e2e/notifications.spec.ts` "sign-in by email": fresh address → `notification_deliveries` has exactly one `otp_code` row (sent, console); the page's text does not contain the code and the old inline `demo-otp` element no longer exists; the code read back through the fail-closed inspect API signs the person in; still one row afterwards. The other specs sign in the same way. | Pass |
| Each booking state transition sends exactly one notification to each affected party, and replaying the same transition sends none | "each transition notifies each affected party once": `FR-8MZE-Q4` driven through approve → prepared → handoff → return due → overdue → check-in → complete via the real `transitionBooking`; after each step the new delivery rows equal the catalogue's plan (8 rows in total, each `sent`, `attempts = 1`). Re-running the notification hook for a past transition returns `deduped` × 2 and inserts nothing; re-applying the transition itself is refused by the state machine (409). Cancellation covered separately (both parties, refund/kept copy). Unit test asserts every event in the machine has an explicit plan. | Pass |
| A provider who has opted out of reminder messages still receives money and dispute messages | "a provider who opted out": Dana switches off Return due and Handoff reminder on `/provider/settings` (stored as `{return_due:false, handoff_reminder:false}`); `return_window_open` then records `skipped · opted_out` for her and `sent` for the renter; a disputed claim and its admin decision (`claim_answered`, `dispute_decided`) and a payout marked paid (`payout_sent`) all reach her as `sent`. The handoff-reminder job records her skips too. | Pass |
| Demo mode sends nothing over the network | Unit: the console adapter is exercised with `fetch` stubbed to throw and never calls it; it is the default provider. E2E: every delivery row asserted carries `provider = console`. CI sets `NOTIFICATIONS_PROVIDER=console` and the hermetic gate refuses Resend. | Pass |

Also verified: the handoff-reminder job is idempotent across runs (2 bookings reminded, then 0, rows
unchanged); the happy-path spec asserts the receipt promised on the confirmation page went to the
renter and the request/booking to the provider.

**Not verified, by design:** a real email arriving in a real inbox. The Resend adapter is tested
against a mocked HTTP API only; it needs the sending domain and secrets gates above.

### Deferred inside Phase 6

- Notifying providers ahead of a fee change (A05 checkbox) is still a log line — a scheduled broadcast,
  closer to a digest than a transactional message.
- Chargeback alerts to admins (A05 "admin notified within 1 h") and claim-escalation notices are not
  sent; both are visible in the console.
- Provider messages go to the owner's email only; per-member routing is a preferences question for the pilot partner.

---

## Decisions worth remembering

Full list in `CLAUDE.md` under assumptions and deviations, numbered 1 to 50. The ones that shape
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
- **Email is a transactional outbox.** A message is a `notification_deliveries` row written inside the
  transaction that changed the state and sent after it commits; the unique key per (message, subject,
  recipient) is what makes replays inert. Failures stay visible as `failed` rows with the error and are
  retried by `/api/cron/notifications`. Sign-in codes are never stored on the record.
- **"Payout sent" is triggered by ops today.** `markPayoutPaid()` (Admin → Payouts → Mark paid) records an
  off-platform payout and tells the provider; Phase 7 calls the same function from the transfer result.
- **The demo market is fictional.** Port Maren, the Maren dollar and the frozen clock at 5 September
  2026 are seed data. A real market brings its own tax rate, currency, time zone and neighbourhoods.

---

## How to update this file

When a phase opens, set it to in progress and note the date. When it closes, mark it done and record
what the acceptance tests actually showed, including anything that had to be deferred. When a gate
clears, say who cleared it and what changed. Keep the verification table honest: if a run was
partial, say so.
