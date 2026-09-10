# Claude Code — Fab.Rent Phase 7 (Real payouts)

Repo: `nsheinbe/fab-rent` · Branch: `claude/phase-7-real-payouts` · Start from latest `main` (Phase 6 already merged).

Read first: `CLAUDE.md`, `BUILD-PLAN.md` (Phase 7 only + §3 Hard gates + §4 Stack invariants), `PROGRESS.md`, and existing `lib/payments/*` + provider earnings/payout admin surfaces.

Design source of truth: `./design/*.dc.html`. New Connect onboarding surfaces have no frames — build from the existing style guide and record that decision in `PROGRESS.md` / `CLAUDE.md` assumptions.

## Mission

Implement **Phase 7 — Real payouts only**, then hard-stop. Do not start Phase 8.

Stop condition from BUILD-PLAN:

> One rental, end to end, in Stripe **test mode**, where the provider's balance increases by the reconciled amount.

## Honest gate note (do not pretend these are cleared)

BUILD-PLAN marks Phase 7 hard-gated on:
- Stripe account with **Connect enabled** on a legal entity
- Legal entity + platform terms / rental agreement
- Secrets management outside `.env.local`

**Your job for this session:** implement the full Phase 7 code path against Stripe **test mode**, hermetic/CI-safe by default, **fail-closed** when Connect/live secrets are missing. Do **not** invent legal copy, do **not** enable live-mode money movement, do **not** require Nick’s production secrets to merge.

If Connect platform onboarding cannot be fully exercised without Nick’s Stripe Connect platform account, ship:
1. the code + webhook + ledger reconciliation path,
2. unit/e2e coverage against recorded/mock Connect responses where needed,
3. clear PROGRESS.md notes naming what still needs Nick’s Stripe dashboard / legal gates.

Still deliver a PR that is CI-green and demonstrates the money path in test/hermetic configuration.

## Scope (do all of this)

1. **Stripe Connect onboarding for providers** (KYC + bank details). Drive `providers.payouts_paused` (and related requirement state) from the **real Connect account requirements**, not hard-coded flags.
2. **Charge model** moved to whatever Connect shape the platform account supports (prefer the shape already implied by the codebase if any; otherwise Express). Keep the invariant: a **deposit hold is an authorization, never a charge**.
3. **Payout runs from the existing ledger**: entries clear at return check-in; a scheduled run transfers what has cleared; results reconcile back to `payouts`.
4. **Map Connect failures** onto the exception states the admin console already renders; admin retry must actually retry.
5. Update `PROGRESS.md` when Phase 7 opens and when it closes (honest verification + remaining gates).

## Hard rules / stack invariants

- Follow `CLAUDE.md` and BUILD-PLAN §4.
- Do **not** grow Supabase coupling.
- Money is integer cents everywhere; `transitionBooking` remains the only writer of `bookings.status`.
- No marketplace fee/tax/commission numbers hard-coded in components — settings / price snapshot only.
- Test mode and live mode separated by configuration. **No test-mode run may move live money.**
- CI stays hermetic: default mock/test doubles when Stripe Connect secrets are absent; selecting Stripe without required keys throws and names them.
- One PR. Hard stop when Phase 7 acceptance is met (or as far as possible without Nick’s Connect platform account — document the remainder). Do not start Phase 8.

## Acceptance tests (must be demonstrable)

- A provider completes onboarding in **test mode** and the console reflects their real requirement state (or a recorded Connect fixture that exercises the same code path), not a hard-coded one.
- A completed rental produces a transfer whose amount equals rental + extras + delivery − commission, to the cent, and reconciles against the ledger.
- A provider with incomplete verification cannot be paid; admin console explains why.
- A failed transfer lands in the existing exception state; retry actually retries.
- No test-mode run moves money in live mode.

## Out of scope

Multi-currency, instant payouts, negative balances / debt collection, tax reporting beyond existing summary export, Phase 8 legal pages / ID vendor / pilot partner, SMS/push, growing Supabase surface area.

## Done when

- Scope above implemented (or partial with explicit remaining Nick gates listed in PROGRESS.md).
- CI green on the PR branch.
- One PR titled clearly for Phase 7; summarize verification steps (including which Stripe test keys / Connect dashboard steps Nick must supply, if any).
- Hard stop.

## How to run

```bash
cp .env.example .env.local
pnpm install
pnpm db:reset
pnpm check
pnpm test:e2e
```

Stripe Connect test keys only when Nick provides them; otherwise mock/fixtures + fail-closed real adapter.
