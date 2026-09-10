# Claude Code — Fab.Rent Phase 6 (Notifications)

Repo: `nsheinbe/fab-rent` · Branch: `claude/phase-6-notifications` · Start from latest `main`.

Design source of truth: `./design/*.dc.html`. The exact zip Nick provided is also on this branch at `design/fab-rent-designs.zip` — if anything looks off vs the HTML in `design/`, unpack the zip and treat it as authoritative. Ignore `design/frames/` and `design/support.js` (viewer scaffolding). BUILD-PLAN is `BUILD-PLAN.md` on the repo (the zip is design-only; it does not contain a separate build-plan file). Working notes: `CLAUDE.md`. Plan: `BUILD-PLAN.md` + status: `PROGRESS.md`.

## Mission

Implement **Phase 6 — Notifications only**, then hard-stop. Do not start Phase 7 (Stripe Connect / payouts) or Phase 8. Burn the session until Phase 6 acceptance is met and CI is green on this branch.

Completion goal from BUILD-PLAN for this phase:

> No state change that the design shows a person being told about happens silently.

## Scope (do all of this)

1. **`NotificationProvider` interface** shaped like existing `PaymentProvider` / storage boundaries:
   - Console / demo adapter (default): never hits the network; records what would have been sent.
   - One real transactional email adapter behind an env var (e.g. Resend or the repo’s preferred provider if one is already implied — otherwise Resend). Fail closed if the provider is selected but secrets are missing (name the missing keys).
2. **Sign-in codes by email** when not in demo mode. Seeded demo accounts may keep the existing demo path. Non-demo: send exactly one code; **never render the code in the page**.
3. **Lifecycle messages** the design already implies (one per affected party per transition):
   - booking requested, approved, declined
   - handoff reminder, return due, overdue
   - claim raised, claim answered
   - dispute decided
   - payout sent
4. **Delivery is recorded** (table or equivalent) so failed sends are visible to ops, not silent.
5. **Per-message opt-outs**, honoured before send. Money + dispute messages still go even if reminder opt-out is on.
6. **Idempotency**: replaying the same booking transition sends **no** duplicate notifications.
7. Update `PROGRESS.md` when Phase 6 opens and when it closes (honest verification table).

## Hard rules / stack invariants

- Follow `CLAUDE.md` and BUILD-PLAN stack invariants.
- **Do not grow Supabase coupling** — nine files max; new work behind interfaces.
- Money stays integer cents; `transitionBooking` remains the only writer of `bookings.status`.
- Hook notifications from the existing transition / money paths — don’t invent a second status writer.
- CI already exists (Phase 5). Keep it green. Extend unit/e2e as needed for the acceptance tests below.
- Hermetic first: CI and local default use the console adapter. Live email secrets are Nick’s — fail closed if missing; do not invent secrets.
- Out of scope: SMS, push, digests, marketing, in-app notification centre, localisation, Phase 7/8.

## Acceptance tests (must pass)

- Signing in with an email that is **not** a seeded demo account sends exactly one code and **no code appears in the page**.
- Each booking state transition sends exactly one notification to each affected party; replaying the same transition sends none.
- A provider who opted out of reminder messages still receives money and dispute messages.
- Demo mode sends nothing over the network.

## Done when

- Phase 6 scope above is implemented.
- Acceptance tests pass locally / in CI.
- `PROGRESS.md` marks Phase 6 done with what was verified.
- Open (or update) **one PR** titled clearly for Phase 6. Summarize what landed and how to verify.
- Hard stop. Do not start Phase 7.

## How to run

```bash
cp .env.example .env.local
pnpm install
pnpm db:reset
pnpm check
pnpm test:e2e
```

Default payments stay mock/hermetic. Email provider only when env is set.

## If blocked

- Missing email domain / production secrets → keep console adapter + fail-closed real adapter; document the gate in `PROGRESS.md`. Do not block the PR on Nick’s secrets.
- Anything needing Stripe Connect, legal entity, or pilot partner → out of scope (Phase 7/8).
