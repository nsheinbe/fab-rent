# fab.rent — progress

Living status file. Update it when a phase opens, closes, or a gate clears. Phase definitions,
acceptance tests and stop conditions live in [`BUILD-PLAN.md`](BUILD-PLAN.md); this file records
only where things stand.

**Last updated:** 10 September 2026 · Phase 7 real payouts on this branch

---

## Where the product is

The build from the design bundle is complete. Every frame in `design/` maps to a route, the pricing
engine matches the brief's money vectors to the cent, and a rental can be driven end to end against
seeded data: search, book, pay, hand off, return, dispute, settle.

All three gaps named when this file was written are closed in code: CI runs every gate on every
pull request (Phase 5), every state change the design shows a person being told about sends an
email through a recorded, idempotent outbox (Phase 6), and money now reaches providers through
Stripe Connect transfers driven by the ledger (Phase 7) — providers onboard with the payout
provider, their real requirement state drives whether they can be paid, a scheduled run transfers
exactly what has cleared, and the result reconciles back to `payouts`.

What has **not** happened is a transfer on a real Stripe platform account. None with Connect enabled
exists yet (§3 gate), so Phase 7 is proven end to end against the mock payout provider and against
Stripe's API shapes with recorded fixtures, and `pnpm payouts:smoke` is written to perform the stop
condition in Stripe test mode the day the account exists. Nothing in this repository can move live
money by accident: live keys are refused unless `PAYOUTS_LIVE_MODE=1` is set deliberately, and CI
refuses that flag outright.

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
| 6 | Notifications: transactional email, code delivery, lifecycle messages | **Done** ([#5](https://github.com/nsheinbe/fab-rent/pull/5)) | Live sending waits on the email domain + secrets store; the code path is complete and fail-closed |
| 7 | Real payouts: Stripe Connect onboarding, transfers, ledger reconciliation | **Done in code — hermetic** (opened and closed 10 Sep 2026, this PR) | The Stripe test-mode run waits on a Connect-enabled platform account (and, before any live run, the legal and secrets gates); the code path is complete, tested against the mock and Stripe fixtures, and fail-closed |
| 8 | Pilot readiness: legal pages, identity vendor, self-serve onboarding, observability | **Parked** | Scope after Phase 7's test-mode run on the real platform account |

Phases 0–4 shipped in [#1](https://github.com/nsheinbe/fab-rent/pull/1), one commit each. Phase 5
([#3](https://github.com/nsheinbe/fab-rent/pull/3)) added GitHub Actions plus hermetic money-path e2e.
Phase 6 ([#5](https://github.com/nsheinbe/fab-rent/pull/5)): `NotificationProvider` (console + Resend),
sign-in codes by email, lifecycle messages, delivery records, per-message opt-outs.
Phase 7 is this PR: `PayoutProvider` (mock + Stripe Connect, Express accounts, separate charges and
transfers), a `connect_accounts` mirror driven by the account's real requirement state, hosted
onboarding from the provider console, a ledger-driven payout run with idempotent transfers and
reconciliation, admin retry / release / pay-now that really transfer, and the test/live separation.

---

## Gates

| Gate | Status | Blocks |
| --- | --- | --- |
| Stripe account with Connect enabled | **Not cleared** | Phase 7's run on Stripe. Everything up to the transfer is built and verified against the mock and against Stripe's account/transfer shapes; `pnpm payouts:smoke` performs the stop condition in test mode the day the account exists (steps below). |
| Legal entity, platform terms, rental agreement | **Not cleared** | Any live payout run, Phase 8. Express onboarding shows Stripe's own connected-account agreement between Stripe and the provider; fab.rent's platform terms are not written and nothing in this PR invents them. |
| Secrets management outside `.env.local` | **Not cleared** | Live email (Phase 6 code is fail-closed until `RESEND_API_KEY` + `NOTIFICATIONS_FROM` exist somewhere safe), live payouts (`STRIPE_SECRET_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `PAYOUTS_LIVE_MODE`) |
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
| Hermetic payments + notifications + payouts | Pass — mock, console and the mock payout provider allowed; Stripe, Resend or Stripe Connect without secrets throw and name the missing keys; all refused in CI unless `HERMETIC=0`; `PAYOUTS_LIVE_MODE=1` refused in CI outright |
| Typecheck | Pass |
| Lint | Pass, the same two image warnings on deliberate raw tags for user uploads |
| Unit tests | 85 pass (was 63): + fail-closed payout config and test/live separation, requirement state → console flags over four recorded-shape Connect account fixtures, requirement labels, the mock payout provider (deterministic refs, idempotent transfers, scripted failure, account balance), the Stripe adapter against a stubbed client (Express account + capability + onboarding link params, transfer params + idempotency key + transfer group, error mapping, mode mismatch, balances) |
| Production build | Pass |
| End to end | 16 pass, 14 skipped by project (mobile runs the phone-first flows, desktop the money paths, console and notification specs): + 4 Phase 7 money-payout tests; the notifications spec's payout step now pays a real (mock) transfer |

### Phase 7 acceptance tests (BUILD-PLAN)

Run hermetically against the mock payout provider, which records every Connect call; the assertions
are on the money path through the test-only inspect API, not only the screen.

| Acceptance test | How it is verified | Result |
| --- | --- | --- |
| A provider completes onboarding in test mode and the console reflects their real requirement state, not a hard-coded one | `tests/e2e/money-payout.spec.ts` "provider onboarding …": Kestrel Party Hire (never onboarded) → "Set up payouts" → the demo-hosted onboarding ends with the tax ID left out → the console shows *Action needed · Tax ID missing* with "Business tax ID" outstanding. The inspect API confirms `connect_accounts.requirements.currently_due = ["company.tax_id"]` and that `providers.payouts_paused / tax_id_verified / payout_account_verified / payout_account_masked` are exactly what `derivePayoutState` yields from that state; one `payout_account_action` email went out. Completing verification flips the card to *Verified*, clears the pause and `payouts_paused_since`, sends `payout_account_verified` once, and no transfer was ever made. Against Stripe's shapes: `tests/unit/payouts.test.ts` normalises four recorded-shape account objects (verified · tax ID due · bank failed · document pending) into the same flags and copy. | Pass against the mock and the fixtures. **Not run against a real Express account** (gate) |
| A completed rental produces a transfer whose amount equals rental + extras + delivery − commission, to the cent, and reconciles against the ledger | "a completed rental transfers …": `FR-SRC4-09` driven handoff → check-in → no claim through the real `transitionBooking`; its ledger entry clears with `net = price_snapshot.provider.payout_cents`. The Tuesday run pays Northlands' scheduled payout: `payouts.amount_cents` equals the sum of exactly the cleared entries (each `net = gross + commission + adjustment`, and `= provider payout + adjustment` per booking), the one recorded transfer is for that amount to Northlands' connected account under key `payout:<id>:1`, the connected account's balance rose by it, the `payout` ledger row balances it, and Dana received one "Payout sent · $… to Maren Bank •••• 8812". | Pass |
| A provider with incomplete verification cannot be paid and the admin console explains why | "… cannot be paid …": Tomas Reinholt (tax ID missing at the payout provider). The same run re-read his account and made no transfer; Admin → Payouts shows "Tax ID missing · payout paused since 1 Sep" on the row and its account line; "Release" re-reads the account and answers "Still paused: Tax ID missing · …"; the row stays paused and no transfer call exists for his account. | Pass |
| A failed transfer lands in the existing exception state and the retry action actually retries | "… retry actually retries": `FR-OC12-88` completed and scheduled for Tue 15 Sep; the payout provider refuses the transfer → the row is `failed · Transfer failed · Simulated transfer failure · attempt 1` with nothing attached; ops "Retry" → `paid`, `transfer_attempts = 2`, and the two recorded transfer calls carry keys `…:1` (refused) and `…:2` (ok) for the entry's exact net. | Pass |
| No test-mode run moves money in live mode; the two are separated by configuration, not by care | Unit: an `sk_live_` key is refused without `PAYOUTS_LIVE_MODE=1`, a test key is refused with it, the flag is refused in CI, Stripe payouts are refused beside mock charges, the adapter refuses to construct in live mode without the flag and refuses any live-mode object from a test configuration (`mode_mismatch`). `livemode` is stamped on every connected account and payout and the run refuses a row whose mode or adapter differs. `pnpm ci:hermetic` runs the payouts gate on every CI job. | Pass |

**Stop condition** — "one rental, end to end, in Stripe test mode, where the provider's balance
increases by the reconciled amount": met against the mock (connected balance delta = transfer =
ledger sum, asserted) and scripted for Stripe test mode in `scripts/connect-smoke.ts`. **Not yet
performed on Stripe** — see the gate steps below.

### What is needed from Nick to run Phase 7 on Stripe (test mode)

1. A Stripe platform account with **Connect enabled** and Express accounts allowed, in test mode:
   `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_WEBHOOK_SECRET` (platform endpoint: the Phase 4 events
   plus `transfer.reversed`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and a second webhook endpoint at
   the same URL listening to **connected-account** events (`account.updated`,
   `account.external_account.*`, `payout.failed`) whose signing secret goes in
   `STRIPE_CONNECT_WEBHOOK_SECRET`. `STRIPE_CONNECT_COUNTRY` is the two-letter country for new
   accounts (US in test mode; Port Maren is fictional).
2. `pnpm payouts:smoke` with those keys: it creates an Express account, prints Stripe's hosted
   onboarding link (complete it with Stripe's test data), waits until payouts are enabled while
   printing the state the console would derive, funds the test balance with a bypass-pending charge,
   transfers vector 2's provider payout ($209.80), reads it back and asserts the connected balance rose
   by exactly that. No database, no live mode.
3. Then the app itself with `PAYMENTS_PROVIDER=stripe PAYOUTS_PROVIDER=stripe`: onboard a provider
   from `/provider/earnings`, let the `account.updated` webhook drive the card, complete a rental, run
   `/api/cron/payouts` (or Admin → Payouts → "Run due payouts") and read the transfer id off the row.
4. Before any live run: the legal gate (platform terms, rental agreement, deposit disclosure — nothing
   here drafts them), secrets held outside `.env.local`, and `PAYOUTS_LIVE_MODE=1` set deliberately
   beside an `sk_live_` key. CI never accepts that flag.

### Deferred inside Phase 7

- Reconciliation re-reads the last 14 days of transfers (50 per run); an older reversal is ops' to
  spot in the Stripe dashboard.
- A connected account's own failed bank payout (`payout.failed`) is noted for ops and the account is
  re-read; the requirement change Stripe raises afterwards is what pauses the provider.
- `capability.updated` is not handled separately (`account.updated` carries the same state).
- Ops cannot override a pause: the flags are derived from the account, by design. The A05 pause rules
  (`pause_when`) remain the marketplace's lever.
- Negative balances, debt collection, instant payouts and multi-currency stay out of scope.
- The Stripe fixtures are transcribed to Stripe's documented shape; recording them from a live
  platform account is part of step 2 above.

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
- **Money leaves the platform in one place.** `attemptPayout()` (`lib/payouts/run.ts`) re-reads the
  connected account, sums the cleared ledger entries, transfers exactly that under the idempotency key
  `payout:<id>:<attempt>`, and only then attaches the entries and marks the row paid with the transfer
  ref. Ops retry / release / pay-now run the same function; nothing marks a payout paid without a
  transfer. The charge model is separate charges and transfers: renters pay the platform, providers
  are paid from the ledger, holds stay platform-side authorisations.
- **Provider payout flags are derived, never set.** `connect_accounts` mirrors the account's real
  requirement state (webhook, sync, onboarding return); `tax_id_verified`, `payout_account_verified`,
  `payouts_paused` and the design's copy come out of `derivePayoutState()`. The mock's "remote truth"
  for an account it has not seen is that stored mirror, so demos and restarts stay coherent.
- **Test mode and live mode are separated by configuration.** Key prefix decides the mode; live needs
  `PAYOUTS_LIVE_MODE=1`, which CI refuses; every account and payout is stamped with its mode.
- **The demo market is fictional.** Port Maren, the Maren dollar and the frozen clock at 5 September
  2026 are seed data. A real market brings its own tax rate, currency, time zone and neighbourhoods.

---

## How to update this file

When a phase opens, set it to in progress and note the date. When it closes, mark it done and record
what the acceptance tests actually showed, including anything that had to be deferred. When a gate
clears, say who cleared it and what changed. Keep the verification table honest: if a run was
partial, say so.
