# fab.rent

**Premium rental marketplace for equipment, tools and event supplies.**

Renters find gear nearby, book it for a date range with pickup or delivery, pay up front and place a
refundable deposit hold at handoff. Providers run their inventory, calendar, handoffs and payouts from a
console. fab.rent ops handle listing review, disputes and marketplace settings. The demo market is
**Port Maren** (Maren dollar, `$` / MRD); all demo data is anchored to Saturday 5 September 2026, 10:00.

The product is built from the finished design in [`design/`](design/) (Overview, Renter Mobile M01–M14,
Renter Web W01–W05, Provider P01–P07, Admin A01–A05). Working notes, money rules, the booking state
machine and the running list of assumptions live in [`CLAUDE.md`](CLAUDE.md).

## Surfaces

| Surface | Routes | Design |
| --- | --- | --- |
| Renter (mobile-first, desktop from `lg`) | `/`, `/search`, `/listings/[slug]`, `/book/[listingId]`, `/auth`, `/checkout/[draftId]`, `/bookings/[ref]/confirmed`, `/rentals`, `/rentals/[ref]` (`/extend`, `/review`), `/inbox`, `/saved`, `/profile` | M01–M14, W01–W05 |
| Provider console | `/provider` (dashboard), `/provider/bookings`, `/provider/bookings/[ref]/handoff`, `…/return`, `/provider/listings`, `/provider/calendar`, `/provider/earnings`, inventory, inbox, reviews, settings | P01–P07 |
| Admin console | `/admin` (overview), `/admin/users`, `/admin/listing-review`, `/admin/disputes/[code]`, `/admin/settings`, bookings, payouts, reports | A01–A05 |
| Style guide | `/styleguide` | Overview |

## Quick start

Prerequisites: Node 20+, pnpm 10, and either a local PostgreSQL 16 or the Supabase CLI.

```bash
cp .env.example .env.local     # defaults run in demo mode against postgresql://…/fabrent
pnpm install
pnpm db:reset                  # creates the database, applies supabase/local + migrations + seed.sql
pnpm dev                       # http://localhost:3000
```

`pnpm db:reset` applies `supabase/local/00_auth_shim.sql` (the `auth` schema and roles Supabase ships) so the
same migrations, RLS policies and seed run on plain Postgres. With the Supabase CLI instead:
`supabase start && supabase db reset`, then point `DATABASE_URL` at the local Supabase Postgres and set the
`NEXT_PUBLIC_SUPABASE_*` keys.

### Demo mode

Without Supabase keys the app runs fully offline:

- **Sign-in**: pick a demo account on `/auth`, or enter any email and use the one-time code the server
  prints to its console (`[notify] you@example.com · 123456 is your fab.rent sign-in code`). Codes are never
  shown in the page. `DEMO_NOW` freezes the clock; sessions are HMAC-signed cookies.
- **Email** goes through the console adapter: every lifecycle message (booking requested, confirmed,
  declined, cancelled, reminders, claims, disputes, extensions, payouts, listing decisions) is logged and
  recorded in `notification_deliveries`; nothing leaves the machine.
- **Photos** are stored under `.data/storage/<bucket>/` and served through `/api/storage/*` with short-lived
  signed tokens for private buckets.
- **Payments** use the deterministic mock provider (holds, captures, releases and refunds are all modelled;
  only card brand, last four and expiry are stored).
- **Chat** polls every 15 s (Supabase Realtime is used when configured).

| Demo account | Role |
| --- | --- |
| `priya.nair@example.com` — Priya Nair | Renter (has the active Hilti booking, the checkout flow starts here) |
| `jonas.k@example.com` — Jonas Kellner | Renter |
| `elena.v@example.com` — Elena Vasquez | Renter (respondent in dispute D-0912) |
| `dana@northlandstoolhire.example.com` — Dana Okafor | Provider owner, Northlands Tool & Hire |
| `femi@saltwaymarine.example.com` — Femi Adeyemi | Provider owner, Saltway Marine & Outdoor |
| `tomas.r@example.com` — Tomas Reinholt | Individual provider |
| `ines@fab.rent` — Ines Varga | Staff, marketplace ops |
| `ola@fab.rent` — Ola Rasmussen | Staff, trust & safety |

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev server / production build / serve |
| `pnpm check` | Hermetic payments gate + `typecheck` + `lint` + unit tests — the pre-commit gate |
| `pnpm test` | Vitest: pricing vectors (§5 of the brief), booking state machine, listing checks, hermetic payments |
| `pnpm test:e2e` | Playwright: renter happy path at 390 and 1280, provider handoff → return (mobile), admin dispute + listing review (desktop), money paths (cancel / claim / declined card) |
| `pnpm ci:hermetic` | Fail-closed if `PAYMENTS_PROVIDER=stripe` is set without live secrets, or in CI without `HERMETIC=0` |
| `pnpm db:reset` | Drop/create the database, apply migrations and seed |
| `pnpm db:types` | Regenerate `lib/db/types.generated.ts` from the database |
| `pnpm seed:generate` | Regenerate `supabase/seed.sql` from `supabase/seed/generate.ts` |

Playwright starts its own server on port 3100 (`reuseExistingServer` is on). It always forces
`PAYMENTS_PROVIDER=mock` and `E2E_INSPECT=1` so money-path specs can read the ledger and the mock's
recorded calls. Run `pnpm db:reset` first so the seeded state is intact; the specs book, hand off,
return and resolve real rows. Set `CHROMIUM_PATH` if Chromium is not on the default Playwright path.

CI (`.github/workflows/ci.yml`) runs the same gates against a Postgres 16 service: hermetic check,
typecheck, lint, unit tests, `pnpm db:reset`, production build, then Playwright. Stripe is refused
unless every live secret is present, and refused again in CI (hermetic first).

## Architecture

- **Next.js 16 App Router** with Server Components and Server Actions; TypeScript strict; Tailwind CSS 4
  with the design tokens in `@theme`; Radix primitives under a small in-repo component library
  (`components/ui`, `components/domain`).
- **Postgres with RLS on every table.** Server code talks SQL through Kysely + `pg`, but every request runs
  inside `withActor()`: a transaction that sets the Supabase JWT claims and `SET LOCAL ROLE`, so RLS is
  enforced for server code exactly as it would be for PostgREST. System-owned rows (ledger, credits,
  payouts) are written through `asSystem()` inside the same transaction.
- **Pure engines**: `lib/pricing` (quotes, extensions, late fees, cancellations, claims against a hold,
  settings previews), `lib/booking-state` (`transitionBooking()` is the only way a status changes),
  `lib/listing-checks` (automated checks + review routing). All money is integer cents.
- **Settings are versioned** (`marketplace_settings_versions`): fees, holds, waiver, cancellation
  policies, SLAs and payout rules come from the live version; bookings carry a `price_snapshot`.
- **Payments** go through a `PaymentProvider` interface (`authorize` / `capture` / `release` / `charge` /
  `refund` / `extendAuthorization`). A deposit hold is always an authorization, never a charge.
- **Time**: `timestamptz` in the database, displayed in the market time zone; `lib/time.now()` honours
  `DEMO_NOW`.

## Configuration

| Feature | Env | Behaviour |
| --- | --- | --- |
| Database | `DATABASE_URL` | Required. Plain Postgres or the Supabase connection string. |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Enables Supabase Auth (Google / Apple / email OTP), Storage buckets and Realtime chat. Unset → demo mode. |
| Stripe | `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_CURRENCY` | Card Element + SetupIntent at checkout; PaymentIntents with manual capture for holds; webhook at `/api/webhooks/stripe`. |
| Stripe Connect (payouts) | `PAYOUTS_PROVIDER=stripe`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CONNECT_COUNTRY`, `PAYOUTS_LIVE_MODE` | Express connected accounts with Stripe-hosted onboarding; transfers of cleared ledger entries on each provider's schedule; the same webhook URL, verified with the connected-accounts secret. Defaults to the mock: simulated onboarding at `/provider/earnings/onboarding`, recorded transfers. Needs `PAYMENTS_PROVIDER=stripe`; live keys refused without `PAYOUTS_LIVE_MODE=1`, which CI never accepts. |
| Email | `NOTIFICATIONS_PROVIDER=resend`, `RESEND_API_KEY`, `NOTIFICATIONS_FROM`, `NOTIFICATIONS_REPLY_TO`, `APP_URL` | Transactional email through Resend (sign-in codes + lifecycle messages). Unset → console adapter, which logs and records but never sends. Fail-closed: missing secrets name themselves; CI refuses Resend unless `HERMETIC=0`. |
| Jobs | `CRON_SECRET` | Protects `/api/cron/[job]` (bearer token or `?secret=`). |
| Demo clock | `DEMO_NOW` | Market-local ISO time; unset for real time. |
| Maps | `NEXT_PUBLIC_DISABLE_MAPLIBRE=1` | Keep the design's placeholder tiles instead of MapLibre demo tiles. |

### Scheduled jobs

`vercel.json` schedules the routes below; any scheduler (Supabase `pg_cron` + `net.http_get`, GitHub
Actions, `curl`) works as long as it sends `CRON_SECRET`. Every job is idempotent.

| Route | Schedule | Moves |
| --- | --- | --- |
| `/api/cron/returns` | every 15 min | `active → return_due` 24 h before the end · `return_due → overdue` after the grace period |
| `/api/cron/holds` | hourly | releases deposit holds 3 business days after check-in when no claim is open |
| `/api/cron/claims` | hourly | escalates claims the renter did not answer into a dispute for ops |
| `/api/cron/hold-expiry` | hourly | marks card authorisations that lapsed (ops can extend from the dispute view) |
| `/api/cron/reviews` | daily | publishes double-blind reviews after the waiting period |
| `/api/cron/reminders` | hourly | handoff reminders to both parties the day before a pickup or delivery (once per booking) |
| `/api/cron/notifications` | every 10 min | re-dispatches queued or failed email deliveries (up to three attempts; failures stay visible in `notification_deliveries`) |

### Deploying

1. Create a Supabase project, run the migrations (`supabase db push`) and, for a demo, `supabase/seed.sql`.
   Create the private Storage buckets `listing-photos`, `condition-photos`, `evidence` and `avatars`.
2. Deploy to Vercel (or any Node host) with the env above. `proxy.ts` guards `/provider/*` and `/admin/*`
   at the edge; layouts and every server action check roles again.
3. Stripe: enable `PAYMENTS_PROVIDER=stripe`, add the webhook endpoint for `payment_intent.canceled`,
   `payment_intent.payment_failed` and `charge.dispute.created`, and set `STRIPE_CURRENCY` (MRD is
   fictional; test mode runs in a real currency).
4. Payouts (Phase 7): on a platform account with Connect enabled, set `PAYOUTS_PROVIDER=stripe` and add a
   second webhook endpoint at the same URL that listens to connected-account events (`account.updated`,
   `account.external_account.*`, `payout.failed`, plus `transfer.reversed` on the platform), with its
   signing secret in `STRIPE_CONNECT_WEBHOOK_SECRET`. Schedule `/api/cron/payouts` (vercel.json does) and
   run `pnpm payouts:smoke` once in test mode to see a transfer land on a connected account. Live keys
   need `PAYOUTS_LIVE_MODE=1` set deliberately.

## Security notes

- Card numbers never reach the server: demo mode stores only brand / last four / expiry; Stripe mode stores
  the payment method id and re-reads the masked data from Stripe before saving.
- Private buckets are served only through short-lived signed URLs; evidence and condition photos are never
  public.
- RLS policies are the source of truth for who sees what; server code cannot bypass them except through the
  explicit `asSystem()` / `runAsSystem()` helpers, which are reserved for ledger writes, notification
  records, webhooks and jobs.
- Outbound email is a transactional outbox: a message is recorded inside the transaction that changed the
  state and sent only after it commits, with a unique key per (message, booking, recipient) so a replayed
  transition or retried job never sends twice. Sign-in codes are never stored on the delivery record.

## License

TBD (lean MIT / Apache-2.0 once code lands).

## Maintainers

`nsheinbe`
