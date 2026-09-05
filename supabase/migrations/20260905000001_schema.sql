-- fab.rent schema · Port Maren demo marketplace
-- Money is integer cents. Times are timestamptz. Every table has RLS (see 000002_rls.sql).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums
create type profile_role as enum ('renter', 'provider', 'staff');
create type profile_status as enum ('active', 'suspended', 'in_dispute');
create type provider_kind as enum ('business', 'individual');
create type staff_role as enum ('marketplace_ops', 'trust_safety');
create type review_mode as enum ('auto_publish_verified', 'manual');
create type listing_status as enum ('draft', 'pending_review', 'changes_requested', 'published', 'hidden', 'rejected');
create type extra_per as enum ('rental', 'day');
create type unit_status as enum ('rentable', 'service_due', 'in_maintenance', 'retired');
create type block_reason as enum ('off_platform', 'service', 'inspection', 'other');
create type fulfillment as enum ('pickup', 'delivery');
create type booking_status as enum (
  'requested', 'confirmed', 'ready_for_pickup', 'out_for_delivery', 'active',
  'return_due', 'overdue', 'inspecting', 'completed', 'cancelled', 'disputed'
);
create type hold_status as enum ('none', 'placed', 'released', 'partially_captured', 'captured', 'expired');
create type condition_kind as enum ('handoff', 'return');
create type claim_type as enum ('damage', 'late', 'cleaning', 'missing');
create type claim_status as enum ('open', 'accepted', 'disputed', 'settled', 'dismissed');
create type dispute_status as enum ('awaiting_decision', 'more_evidence', 'resolved', 'appealed');
create type dispute_decision as enum ('uphold_full', 'uphold_partial', 'dismiss', 'goodwill_credit');
create type extension_status as enum ('requested', 'approved', 'declined', 'cancelled');
create type message_kind as enum ('text', 'photo', 'system');
create type review_target as enum ('listing', 'provider', 'renter');
create type ledger_type as enum ('rental', 'delivery_extras', 'commission', 'claim', 'refund', 'payout');
create type ledger_status as enum ('pending', 'available', 'paid', 'held_claim', 'inspecting');
create type payout_status as enum ('scheduled', 'paid', 'failed', 'paused');
create type listing_review_kind as enum ('new', 'edited', 'reported');
create type listing_review_decision as enum ('approve', 'request_changes', 'reject');
create type settings_status as enum ('draft', 'live', 'archived');
create type payment_kind as enum ('card', 'apple_pay');

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  neighbourhood text,
  role profile_role not null default 'renter',
  id_verified boolean not null default false,
  id_verified_method text,
  id_verified_at timestamptz,
  rating_from_providers numeric(3,2),
  rating_count integer not null default 0,
  completed_count integer not null default 0,
  late_return_count integer not null default 0,
  flags text[] not null default '{}',
  status profile_status not null default 'active',
  avatar_path text,
  is_business boolean not null default false,
  public_id serial,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles for each row execute function set_updated_at();

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind payment_kind not null default 'card',
  brand text not null,
  last4 text not null,
  exp_month smallint,
  exp_year smallint,
  is_default boolean not null default false,
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payment_methods(profile_id);

-- ---------------------------------------------------------------- providers
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  kind provider_kind not null default 'business',
  name text not null,
  slug text not null unique,
  owner_profile_id uuid not null references public.profiles(id),
  address text,
  lat double precision,
  lng double precision,
  neighbourhood text,
  opening_hours jsonb not null default '{}'::jsonb,
  accepting_bookings boolean not null default true,
  verified boolean not null default false,
  insurance_valid_until date,
  tax_id text,
  tax_id_verified boolean not null default false,
  payout_account_masked text,
  payout_account_verified boolean not null default false,
  payout_schedule text not null default 'weekly_tue',
  payouts_paused boolean not null default false,
  payouts_paused_reason text,
  delivery_vans jsonb not null default '[]'::jsonb,
  rating numeric(3,2),
  rating_count integer not null default 0,
  response_minutes integer,
  on_time_pct numeric(5,2),
  completed_count integer not null default 0,
  years_on_platform integer,
  about text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger providers_updated before update on public.providers for each row execute function set_updated_at();

create table public.provider_members (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, profile_id)
);
create index on public.provider_members(profile_id);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  role staff_role not null,
  permissions text[] not null default '{}',
  two_factor boolean not null default false,
  resolved_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id),
  name text not null,
  slug text not null unique,
  icon text,
  sort integer not null default 0,
  review_mode review_mode not null default 'auto_publish_verified',
  price_alert_pct numeric(5,2) not null default 35,
  required_documents jsonb not null default '[]'::jsonb,
  renter_requirements text[] not null default '{}',
  listing_count_display integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.categories(parent_id);

-- ---------------------------------------------------------------- settings & policies
create table public.marketplace_settings_versions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  config jsonb not null,
  status settings_status not null default 'draft',
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  change_summary text,
  changes jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_live_settings on public.marketplace_settings_versions (status) where status = 'live';
create trigger settings_updated before update on public.marketplace_settings_versions for each row execute function set_updated_at();

create table public.cancellation_policies (
  id text primary key,
  name text not null,
  short_label text,
  free_until_hours integer not null,
  tiers jsonb not null,
  provider_cancel_credit_cents integer,
  provider_cancel_credit_pct numeric(5,2),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- listings
create sequence public.listing_code_seq start 88100;

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  title text not null,
  slug text not null unique,
  brand text,
  model text,
  condition text,
  age_years numeric(4,1),
  last_serviced_at date,
  description text not null default '',
  specs jsonb not null default '[]'::jsonb,
  included_accessories text[] not null default '{}',
  day_cents integer not null,
  weekend_cents integer,
  week_cents integer,
  month_cents integer,
  hold_cents integer not null,
  hold_with_waiver_cents integer,
  late_fee_cents_per_hour integer not null default 0,
  late_grace_minutes integer not null default 60,
  cleaning_fee_cents integer not null default 0,
  min_days integer not null default 1,
  max_days integer not null default 30,
  prep_hours numeric(5,2) not null default 2,
  same_day_cutoff_minutes integer not null default 120,
  instant_book boolean not null default false,
  pickup_enabled boolean not null default true,
  pickup_address text,
  pickup_lat double precision,
  pickup_lng double precision,
  pickup_hours jsonb not null default '{}'::jsonb,
  pickup_hours_label text,
  pickup_instructions text,
  delivery_enabled boolean not null default false,
  delivery_radius_km numeric(6,2) not null default 15,
  delivery_window_hours numeric(4,1) not null default 2,
  delivery_base_cents integer not null default 0,
  delivery_base_km numeric(5,2) not null default 5,
  delivery_per_km_cents integer not null default 0,
  delivery_notes text,
  rules text[] not null default '{}',
  id_required boolean not null default true,
  min_renter_age integer not null default 18,
  cancellation_policy_id text not null references public.cancellation_policies(id),
  status listing_status not null default 'draft',
  quality_score integer,
  listing_code text not null unique default ('L-' || nextval('public.listing_code_seq')::text),
  rating numeric(3,2),
  rating_count integer not null default 0,
  search_text tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '') || ' ' || coalesce(description, ''))) stored,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.listings(provider_id);
create index on public.listings(category_id);
create index on public.listings(status);
create index listings_search_idx on public.listings using gin (search_text);
create trigger listings_updated before update on public.listings for each row execute function set_updated_at();

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  storage_path text,
  label text,
  sort integer not null default 0,
  is_cover boolean not null default false,
  has_serial_plate boolean not null default false,
  is_stock boolean not null default false,
  photo_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.listing_photos(listing_id);

create table public.listing_extras (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null,
  description text,
  price_cents integer not null,
  per extra_per not null default 'rental',
  is_damage_waiver boolean not null default false,
  waiver_covers_cents integer,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.listing_extras(listing_id);

create table public.listing_documents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  key text not null,
  label text not null,
  storage_path text,
  issued_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  unit_number integer not null,
  serial text not null,
  acquired_at date,
  hours integer,
  next_service_at date,
  status unit_status not null default 'rentable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, unit_number)
);
create index on public.units(listing_id);
create unique index units_serial_idx on public.units(serial);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  unit_id uuid references public.units(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason block_reason not null default 'other',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index on public.availability_blocks(listing_id, start_at, end_at);

-- ---------------------------------------------------------------- bookings
create table public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  anonymous_key text,
  profile_id uuid references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.booking_drafts(anonymous_key);
create index on public.booking_drafts(profile_id);
create trigger drafts_updated before update on public.booking_drafts for each row execute function set_updated_at();

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  renter_id uuid not null references public.profiles(id),
  provider_id uuid not null references public.providers(id),
  listing_id uuid not null references public.listings(id),
  unit_id uuid references public.units(id),
  unit_ids uuid[] not null default '{}',
  qty integer not null default 1,
  start_at timestamptz not null,
  end_at timestamptz not null,
  billed_days integer not null,
  fulfillment fulfillment not null default 'pickup',
  delivery_address text,
  delivery_lat double precision,
  delivery_lng double precision,
  delivery_km numeric(6,2),
  delivery_area text,
  drop_window jsonb,
  collect_window jsonb,
  van text,
  status booking_status not null default 'requested',
  instant boolean not null default false,
  price_snapshot jsonb not null,
  charged_cents integer not null,
  hold_cents integer not null,
  hold_status hold_status not null default 'none',
  hold_placed_at timestamptz,
  hold_released_at timestamptz,
  hold_expires_at timestamptz,
  hold_captured_cents integer not null default 0,
  payment_method_id uuid references public.payment_methods(id),
  payment_method_label text,
  payment_refs jsonb not null default '{}'::jsonb,
  cancellation_policy_snapshot jsonb not null,
  free_cancel_until timestamptz,
  return_due_at timestamptz,
  returned_at timestamptz,
  prep_note text,
  settings_version integer not null,
  cancelled_at timestamptz,
  cancelled_by text,
  cancellation_snapshot jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);
create index on public.bookings(renter_id);
create index on public.bookings(provider_id, status);
create index on public.bookings(listing_id, start_at, end_at);
create index on public.bookings(status);
create trigger bookings_updated before update on public.bookings for each row execute function set_updated_at();

create table public.booking_extras (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  extra_id uuid references public.listing_extras(id),
  name text not null,
  per extra_per not null,
  qty integer not null default 1,
  days integer not null default 1,
  unit_cents integer not null,
  amount_cents integer not null,
  is_damage_waiver boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.booking_extras(booking_id);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  type text not null,
  actor_role text not null,
  actor_id uuid,
  actor_name text,
  from_status booking_status,
  to_status booking_status,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.booking_events(booking_id, occurred_at);

create table public.condition_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind condition_kind not null,
  unit_id uuid references public.units(id),
  serial_scanned text,
  serial_matches boolean,
  id_matched boolean,
  id_checked_at timestamptz,
  photos jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  fuel_level text,
  renter_signature_path text,
  provider_member_id uuid references public.profiles(id),
  geotag jsonb,
  location_label text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.condition_records(booking_id, kind);
create trigger condition_updated before update on public.condition_records for each row execute function set_updated_at();

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  condition_record_id uuid references public.condition_records(id),
  type claim_type not null,
  area text,
  description text,
  amount_cents integer not null,
  repair_estimate_cents integer,
  out_of_service_days integer,
  evidence jsonb not null default '[]'::jsonb,
  status claim_status not null default 'open',
  renter_respond_by timestamptz,
  settled_cents integer,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.claims(booking_id);
create trigger claims_updated before update on public.claims for each row execute function set_updated_at();

create sequence public.dispute_code_seq start 913;
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('D-' || lpad(nextval('public.dispute_code_seq')::text, 4, '0')),
  claim_id uuid references public.claims(id),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  claimant_provider_id uuid references public.providers(id),
  claimant_profile_id uuid references public.profiles(id),
  respondent_profile_id uuid references public.profiles(id),
  respondent_provider_id uuid references public.providers(id),
  summary text not null,
  statements jsonb not null default '[]'::jsonb,
  assignee_staff_id uuid references public.staff(id),
  opened_at timestamptz not null default now(),
  decision_due_at timestamptz not null,
  status dispute_status not null default 'awaiting_decision',
  decision dispute_decision,
  charged_cents integer,
  released_cents integer,
  paid_to_provider_cents integer,
  reasoning text,
  send_reasoning boolean not null default true,
  internal_notes jsonb not null default '[]'::jsonb,
  evidence_areas jsonb not null default '[]'::jsonb,
  last_event text,
  last_event_at timestamptz,
  resolved_at timestamptz,
  appeal_by timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.disputes(status, decision_due_at);
create trigger disputes_updated before update on public.disputes for each row execute function set_updated_at();

create table public.extension_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  new_end_at timestamptz not null,
  extra_days integer not null,
  amount_cents integer not null,
  quote jsonb not null default '{}'::jsonb,
  status extension_status not null default 'requested',
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.extension_requests(booking_id);
create trigger extensions_updated before update on public.extension_requests for each row execute function set_updated_at();

-- ---------------------------------------------------------------- messaging
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete set null,
  listing_id uuid references public.listings(id) on delete set null,
  provider_id uuid not null references public.providers(id) on delete cascade,
  renter_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text,
  renter_unread integer not null default 0,
  provider_unread integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations(renter_id);
create index on public.conversations(provider_id);
create index on public.conversations(booking_id);
create trigger conversations_updated before update on public.conversations for each row execute function set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id),
  sender_side text not null check (sender_side in ('renter', 'provider', 'system')),
  kind message_kind not null default 'text',
  body text,
  photo_path text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------- reviews
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_side text not null check (author_side in ('renter', 'provider')),
  target review_target not null,
  listing_id uuid references public.listings(id),
  provider_id uuid references public.providers(id),
  renter_id uuid references public.profiles(id),
  item_stars smallint check (item_stars between 1 and 5),
  provider_stars smallint check (provider_stars between 1 and 5),
  renter_stars smallint check (renter_stars between 1 and 5),
  tags text[] not null default '{}',
  body text,
  photos jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.reviews(listing_id, published_at);
create index on public.reviews(booking_id);

-- ---------------------------------------------------------------- money
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  payout_id uuid,
  entry_date date not null,
  type ledger_type not null,
  description text,
  gross_cents integer not null default 0,
  commission_cents integer not null default 0,
  adjustment_cents integer not null default 0,
  adjustment_label text,
  net_cents integer not null default 0,
  status ledger_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.ledger_entries(provider_id, entry_date desc);
create index on public.ledger_entries(booking_id);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  amount_cents integer not null,
  scheduled_for date not null,
  paid_at timestamptz,
  status payout_status not null default 'scheduled',
  account_masked text,
  rental_count integer not null default 0,
  exception text,
  exception_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.payouts(provider_id, scheduled_for desc);
alter table public.ledger_entries add constraint ledger_payout_fk foreign key (payout_id) references public.payouts(id) on delete set null;

create table public.renter_credits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id),
  amount_cents integer not null,
  reason text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- saved, review queue, admin
create table public.saved_listings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, listing_id)
);

create table public.listing_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  kind listing_review_kind not null default 'new',
  reasons text[] not null default '{}',
  checks jsonb not null default '[]'::jsonb,
  submitted_snapshot jsonb,
  previous_day_cents integer,
  assignee_staff_id uuid references public.staff(id),
  decision listing_review_decision,
  change_request jsonb,
  message_to_provider text,
  reject_reason text,
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  sla_paused boolean not null default false,
  sla_paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.listing_reviews(decision, submitted_at);
create trigger listing_reviews_updated before update on public.listing_reviews for each row execute function set_updated_at();

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  actor_name text not null,
  action text not null,
  target_type text,
  target_id text,
  target_label text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.admin_actions(occurred_at desc);

create table public.internal_notes (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  author_id uuid references public.profiles(id),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.internal_notes(target_type, target_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  reporter_id uuid references public.profiles(id),
  kind text not null,
  body text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  code text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.otp_codes(identifier, expires_at desc);

-- ---------------------------------------------------------------- storage buckets
insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true), ('condition-photos', 'condition-photos', false), ('evidence', 'evidence', false)
on conflict (id) do nothing;
