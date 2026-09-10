-- Phase 7 · Real payouts (Stripe Connect).
-- One connected payout account per provider, mirrored from the payout provider's real requirement
-- state (webhook + sync) so providers.payouts_paused / tax_id_verified / payout_account_verified are
-- derived from that state, never hand-set. Transfer bookkeeping lives on payouts. connect_accounts
-- rows are system-owned: written through asSystem()/runAsSystem() only; members and staff read them.

create table public.connect_accounts (
  provider_id uuid primary key references public.providers(id) on delete cascade,
  -- which adapter owns the account: 'mock' (demo, deterministic) or 'stripe'
  payout_provider text not null,
  -- acct_… at Stripe, acct_mock_… for the demo adapter
  account_ref text not null unique,
  -- a test-mode account can never be paid by a live-mode run (and vice versa)
  livemode boolean not null default false,
  business_type text,
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  -- {currently_due, past_due, eventually_due, pending_verification, errors, current_deadline}
  requirements jsonb not null default '{}'::jsonb,
  disabled_reason text,
  -- {bank_name, last4, currency, status} of the first external account, or null
  external_account jsonb,
  onboarding_started_at timestamptz,
  onboarding_completed_at timestamptz,
  last_synced_at timestamptz,
  -- last webhook event applied (redeliveries are inert)
  last_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger connect_accounts_updated before update on public.connect_accounts for each row execute function set_updated_at();

alter table public.connect_accounts enable row level security;
create policy connect_accounts_read on public.connect_accounts for select using (public.is_provider_member(provider_id) or public.is_staff() or public.is_service_role());
-- no insert/update policies: writes go through the service role only

-- when the current pause began ("payout paused since 1 Sep"); cleared when payouts resume
alter table public.providers add column if not exists payouts_paused_since timestamptz;

alter table public.payouts
  add column if not exists payout_provider text,
  -- tr_… once a transfer was created for this payout
  add column if not exists transfer_ref text,
  -- part of the idempotency key: a retry after a recorded failure gets a fresh key, a replay after a crash reuses the last one
  add column if not exists transfer_attempts integer not null default 0,
  add column if not exists livemode boolean not null default false,
  add column if not exists last_attempt_at timestamptz,
  -- set once the transfer was read back from the provider and its amount matched the ledger
  add column if not exists reconciled_at timestamptz;
create unique index payouts_transfer_ref_idx on public.payouts (transfer_ref) where transfer_ref is not null;
create index ledger_entries_cleared_idx on public.ledger_entries (provider_id) where status = 'available' and payout_id is null;
