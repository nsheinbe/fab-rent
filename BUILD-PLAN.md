# fab.rent — build plan

Written 7 September 2026 against `main` @ `877e75f`. Planning document only: no product code is
changed by the pull request that adds it.

## The goal this plan completes

fab.rent can already run a full rental end to end — search, book, pay, hand off, return, dispute,
settle — against seeded data, on one machine. The brief it was built from ("build the product from
the design") is finished.

The goal from here is narrow and finite:

> **Take real money for a real rental, in one real market, and pay the provider — safely and
> legally.**

That is the completion condition for this plan. When the phases below are done, fab.rent is a
marketplace running a supervised pilot, not a demo. Everything that does not serve that sentence is
parked at the bottom of this file, on purpose.

---

## 1. What exists today

Honest inventory. "Done" means it works and is covered by a test or a design frame it reproduces.
"Partial" means the seam exists but the real implementation behind it does not.

### Done

| Area | State |
| --- | --- |
| **Pricing engine** (`lib/pricing`) | Days, rates, extras, delivery, fees, tax, holds, late fees, cancellations, claims, settings previews. 22 unit tests covering the brief's money vectors to the cent. Pure functions, no I/O. |
| **Booking state machine** (`lib/booking-state`) | 11 statuses, one writer (`transitionBooking`), every transition writes a `booking_events` row. 5 unit tests. |
| **Listing checks** (`lib/listing-checks`) | Automated checks plus review routing. 8 unit tests. |
| **Schema and RLS** | 34 tables, row-level security on every one, 6 migrations, generated types, deterministic seed anchored to `DEMO_NOW`. `auth.uid()` is used by 27 policies. |
| **Renter surface** | Every frame M01–M14 and W01–W05 has a route. Search with map, booking draft that survives sign-in, checkout, rentals, extensions, inbox, reviews, receipt PDF, calendar file. |
| **Provider console** | Every frame P01–P07. Bookings with side panel, listing editor with review routing, unit calendar, five-step handoff, return check-in, earnings with CSV exports. |
| **Admin console** | Every frame A01–A05. Dispute decisions, listing review, versioned settings with live-versus-draft diff, publish and rollback. |
| **Renter-side money in** | Stripe adapter: charges, manual-capture holds, partial capture, release, refund, authorization extension. Refunds are wired into cancellation. Signature-verified webhook for lapsed holds, failed payments and chargebacks. |
| **Scheduled jobs** | Return transitions, hold release, claim escalation, review publication, hold expiry. Behind a secret-protected route with schedules committed. |

### Partial — the seam is real, the far side is not

| Area | What is there | What is missing |
| --- | --- | --- |
| **Authentication** | Supabase Auth when configured; otherwise HMAC cookie sessions with a demo account picker. | No Auth.js. One-time codes are rendered on screen, never delivered. |
| **Storage** | Local disk or Supabase Storage behind a `StorageAdapter` interface. | No S3 or R2 adapter. |
| **Realtime chat** | Supabase Realtime when configured, 15-second polling otherwise. | Nothing that works on a non-Supabase database except the poll. |
| **ID verification** | `IdVerificationProvider` interface with a mock that sleeps two seconds and passes. | No vendor integration. Every "verified" badge in the product is currently fictional. |
| **Payouts** | Ledger entries, payout rows, schedules, pause and exception states, admin retry and release actions. | **No money moves.** The admin actions change a row's status. There is no Stripe Connect account, no transfer, no bank detail anywhere. |
| **End-to-end tests** | Three specs, 186 lines: renter happy path, provider handoff and return, admin dispute. | Only happy paths. Nothing exercises cancellation refunds, claim capture against a hold, or a failed payment. |
| **Settings publishing** | Draft, diff, publish, rollback, audit trail. | Single approver; the design calls for two. |

### Missing entirely

- **Stripe Connect.** No provider onboarding, no know-your-customer flow, no transfers. This is the
  single largest gap between the current build and a marketplace that can accept real money.
- **Any outbound notification.** No email, SMS or push of any kind exists in the repository. A
  renter books a saw and hears nothing. A provider gets a request and hears nothing. A dispute is
  decided and nobody is told.
- **Continuous integration.** There is no `.github/` directory. Every quality gate that has ever run
  on this project ran on one machine, by hand.
- **Provider self-serve onboarding.** The invite control is a `mailto:` link.
- **Observability.** No error tracking, no structured logs, no uptime checks, no product analytics.
- **Legal surface.** No terms, no privacy policy, no rental agreement, no cancellation disclosure.
  Tax is a single configurable rate.

---

## 2. Phases

Four phases. Each names what stops it, so none of them can quietly become permanent.

---

### Phase 5 — Trust the gates

**Why first.** Every check that has validated this codebase ran locally. Before touching money
paths, the gate has to live somewhere other than a laptop, and it has to cover the paths where money
moves.

**Scope**

- GitHub Actions workflow: typecheck, lint, unit tests, production build, and end-to-end tests
  against a Postgres service container. The Playwright config is already CI-aware (retries, GitHub
  reporter, `reuseExistingServer` off under CI), so this is configuration, not redesign.
- Extend end-to-end coverage to the three money paths that currently have none: cancel inside the
  fee window and assert the refund, accept a damage claim and assert the partial capture, and a
  declined payment at checkout.
- Assert against the ledger and the payment provider's recorded calls, not only the screen.

**Acceptance tests**

- A pull request with a deliberately broken pricing vector fails CI, and the failure names the
  vector.
- A cancellation inside the fee window produces a refund of the fee and tax on the refunded portion,
  and a ledger entry that balances.
- An accepted claim captures the upheld amount from the hold and releases the remainder, with no
  commission taken on the claim.
- A declined card at checkout leaves no booking, no hold and no ledger entry.

**Out of scope.** Deployment pipelines, preview environments, coverage thresholds, performance
budgets.

**Stop condition.** CI is green on `main` and required on pull requests, and the three money paths
above fail loudly when broken.

---

### Phase 6 — Notifications

**Why second.** A marketplace that never contacts anyone cannot run a pilot, and the sign-in
one-time code is currently displayed on screen, which is a demo affordance, not a login.

**Scope**

- A `NotificationProvider` interface shaped like the existing payment and storage boundaries, with a
  console adapter for demo mode and one real transactional email adapter behind an environment
  variable.
- Deliver sign-in codes by email when not in demo mode.
- The lifecycle messages the design already implies: booking requested, approved, declined, handoff
  reminder, return due, overdue, claim raised, claim answered, dispute decided, payout sent.
- Delivery is recorded, so a message that failed is visible to operations rather than silently lost.
- Per-message opt-outs, honoured before send.

**Acceptance tests**

- Signing in with an email that is not a seeded demo account sends exactly one code and no code
  appears in the page.
- Each booking state transition sends exactly one notification to each affected party, and replaying
  the same transition sends none.
- A provider who has opted out of reminder messages still receives money and dispute messages.
- Demo mode sends nothing over the network.

**Out of scope.** SMS, push notifications, digest emails, marketing, in-app notification centre,
localisation beyond one language.

**Stop condition.** No state change that the design shows a person being told about happens
silently.

---

### Phase 7 — Real payouts

**Why third.** This is the last thing standing between the current build and money reaching a
provider. It is deliberately after CI and notifications, because it is the phase where a mistake
costs somebody real money.

**Hard-gated.** Cannot start before the gates in section 3 are cleared.

**Scope**

- Stripe Connect onboarding for providers, including know-your-customer and bank details, with the
  existing `providers.payouts_paused` states driven by the account's real requirements.
- Move the charge model to whatever Connect shape the account supports, keeping the invariant that a
  deposit hold is an authorization and never a charge.
- Drive payout runs from the existing ledger: entries clear at return check-in, a scheduled run
  transfers what has cleared, and the result reconciles back to `payouts`.
- Map Connect failures onto the exception states the admin console already renders.

**Acceptance tests**

- A provider completes onboarding in test mode and the console reflects their real requirement
  state, not a hard-coded one.
- A completed rental produces a transfer whose amount equals rental plus extras plus delivery, less
  commission, to the cent, and reconciles against the ledger.
- A provider with incomplete verification cannot be paid and the admin console explains why.
- A failed transfer lands in the existing exception state and the retry action actually retries.
- No test-mode run moves money in live mode; the two are separated by configuration, not by care.

**Out of scope.** Multi-currency, instant payouts, negative balances and debt collection, tax
reporting beyond the existing summary export.

**Stop condition.** One rental, end to end, in Stripe test mode, where the provider's balance
increases by the reconciled amount.

---

### Phase 8 — Pilot readiness (parked until 5–7 land)

Legal documents in the product, a real identity verification vendor, self-serve provider onboarding,
error tracking and structured logs, and the single-market launch configuration. Scoped properly when
Phase 7 closes, because what it needs depends on what the pilot partner and the payment account
require.

---

## 3. Hard gates

Work that cannot start until someone outside this repository provides something. Each is a blocker,
not a task.

| Gate | Blocks | What is needed |
| --- | --- | --- |
| **Stripe account** | Phase 7 entirely | A real Stripe account with Connect enabled, on a legal entity, with the marketplace terms accepted. Test-mode keys alone are not enough: Connect onboarding behaviour depends on the platform account's own verification. |
| **Legal entity and terms** | Phase 7, Phase 8 | Who is the counterparty to a rental? The platform's terms, the rental agreement between renter and provider, and the deposit and damage-claim disclosure all need drafting by someone qualified. The dispute engine already makes decisions that need to be defensible. |
| **Secrets management** | Phase 6, Phase 7 | Somewhere that is not `.env.local` to hold the payment secret key, the webhook signing secret, the email provider key and the cron secret, with separate values per environment. |
| **Email sending domain** | Phase 6 | A domain with sender authentication configured, and a decision about the reply-to address for booking mail. |
| **Identity verification vendor** | Phase 8 | A contract with a vendor. Until then every "ID verified" badge in the product is decorative and should be treated as such in any pilot. |
| **Pilot partner** | Phase 8 | One real provider with real inventory in one real city. The demo market is fictional; the launch market is not, and its tax rate, currency, time zone and neighbourhood list all come from the partner's reality. |
| **Design bundle** | None currently | The bundle in `design/` covers every frame that has been built. New surfaces in Phases 6–8 (notification templates, onboarding, legal pages) have no frames. Either commission them or build them from the existing style guide and record the decision. |

---

## 4. Stack invariants

These hold unless deliberately revisited and written down here.

1. **Postgres with row-level security is the security boundary.** Every table has policies. Server
   code runs inside `withActor`, which sets the request's claims and role for the transaction, so
   the same policies apply to server code as to any client. System-owned writes go through
   `asSystem` inside the caller's transaction, never around it.

2. **Target Neon plus Auth.js.** The data path already satisfies this: Kysely over `pg` against a
   plain `DATABASE_URL`, with the `auth` schema provided by an ordinary SQL shim. Nothing in the
   schema, the policies or the queries needs Supabase. The remaining coupling is nine files —
   `lib/supabase/*`, the auth resolver, the storage adapter, the sign-in route and the chat thread —
   and it is all behind interfaces.

   **The rule: that coupling does not grow.** No new Supabase surface area, no Supabase-specific
   feature in a new code path, no migration written against Supabase-only behaviour. When the move
   to Neon and Auth.js happens it is a bounded swap of those nine files, not a rewrite. Realtime is
   the one capability with no Neon equivalent: the polling fallback already exists and is the
   supported path.

3. **Money is integer cents, everywhere.** Formatting happens at the edge. No floating point touches
   an amount.

4. **A deposit hold is an authorization, never a charge.** It becomes a charge only when a claim is
   accepted or upheld. This survives any payment provider change.

5. **No marketplace number is hard-coded in a component.** Fees, tax, holds, waivers, cancellation
   policies, service levels and payout rules come from the live settings version, or from the
   booking's own price snapshot for anything already booked.

6. **`transitionBooking` is the only writer of `bookings.status`.** New flows add events, not new
   ways to move a booking.

7. **Every quality gate runs in CI once Phase 5 lands.** After that, local-only verification is not
   evidence.

---

## 5. What is active

**Active now, in order:**

1. **Phase 5 — Trust the gates.** No external dependency. Can start immediately.
2. **Phase 6 — Notifications.** Needs the email domain and secrets gates.
3. **Phase 7 — Real payouts.** Needs the Stripe and legal gates. Do not start before they clear.

**Parked.** Not scheduled, not forgotten. Revisit only after the active phases close.

- Phase 8 pilot readiness, scoped when Phase 7 closes.
- Second approver for settings publication.
- Drag-to-reassign on the provider calendar (click-to-reassign ships today).
- Per-category return checklists (generic areas ship today).
- Search analytics, which is why the admin overview shows a dash for search-to-booking.
- Duplicate photo detection by image hash (path-based hashing ships today).
- Multi-market and multi-currency.
- Native applications.

Everything parked is recorded in `CLAUDE.md` under assumptions and deviations, with the working
stand-in named. Nothing on this list blocks a pilot.
