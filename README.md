# Fab.Rent — American manufacturing

The homepage now presents a manufacturing and sourcing marketplace: search by capability, product, material, or location; inspect manufacturer profiles; shortlist and compare suppliers; prepare a request for quote. See [the redesign scope](MANUFACTURING-REDESIGN.md).

**This is an interactive UI/UX prototype.** Six fictional suppliers and AI-generated catalog illustrations demonstrate the design. RFQs and manufacturer profiles download as text drafts; nothing is sent or published. Shortlists are stored only in the current browser. Draft form entries last only in the current tab.

Run `pnpm dev` for the Next.js app, or `pnpm build:preview` to produce a standalone design preview in `dist/`. The preview uses the same React components and styling as the app and requires no database. Sites hosts only this static manufacturing preview, not the retained rental back end.

The original rental homepage is preserved at `/rental-home`; existing rental, provider, admin, payment, and database flows remain available under their established routes. They have **not** been converted into manufacturing transactions.

## Legacy rental application reference

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

- **Sign-in**: pick a demo account on `/auth`, or enter any email and use the one-time code shown inline
  (`DEMO_NOW` freezes the clock; sessions are HMAC-signed cookies).
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

### Deploying

1. Create a Supabase project, run the migrations (`supabase db push`) and, for a demo, `supabase/seed.sql`.
   Create the private Storage buckets `listing-photos`, `condition-photos`, `evidence` and `avatars`.
2. Deploy to Vercel (or any Node host) with the env above. `proxy.ts` guards `/provider/*` and `/admin/*`
   at the edge; layouts and every server action check roles again.
3. Stripe: enable `PAYMENTS_PROVIDER=stripe`, add the webhook endpoint for `payment_intent.canceled`,
   `payment_intent.payment_failed` and `charge.dispute.created`, and set `STRIPE_CURRENCY` (MRD is
   fictional; test mode runs in a real currency).

## Security notes

- Card numbers never reach the server: demo mode stores only brand / last four / expiry; Stripe mode stores
  the payment method id and re-reads the masked data from Stripe before saving.
- Private buckets are served only through short-lived signed URLs; evidence and condition photos are never
  public.
- RLS policies are the source of truth for who sees what; server code cannot bypass them except through the
  explicit `asSystem()` / `runAsSystem()` helpers, which are reserved for ledger writes, webhooks and jobs.

## License

TBD (lean MIT / Apache-2.0 once code lands).

## Maintainers

`nsheinbe`
