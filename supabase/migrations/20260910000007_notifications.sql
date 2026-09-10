-- Phase 6 · Notifications.
-- Every outbound message is recorded here (queued → sent / failed / skipped) so a message that did not
-- reach someone is visible to ops rather than silently lost. Rows are system-owned: written through
-- asSystem()/runAsSystem() only; staff read them, recipients may read their own.

create type notification_channel as enum ('email');
create type notification_status as enum ('queued', 'sending', 'sent', 'failed', 'skipped');

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  -- one message per (template, subject entity, recipient): replaying a transition inserts nothing
  dedupe_key text not null unique,
  template text not null,
  party text,
  channel notification_channel not null default 'email',
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text,
  booking_id uuid references public.bookings(id) on delete set null,
  provider text not null,
  status notification_status not null default 'queued',
  reason text,
  provider_ref text,
  error text,
  subject text,
  body_text text,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_deliveries_booking_idx on public.notification_deliveries (booking_id);
create index notification_deliveries_recipient_idx on public.notification_deliveries (recipient_profile_id);
create index notification_deliveries_status_idx on public.notification_deliveries (status, last_attempt_at);
create trigger notification_deliveries_updated before update on public.notification_deliveries for each row execute function set_updated_at();

alter table public.notification_deliveries enable row level security;
create policy deliveries_staff_read on public.notification_deliveries for select using (public.is_staff() or public.is_service_role());
create policy deliveries_self_read on public.notification_deliveries for select using (recipient_profile_id = auth.uid());
-- no insert/update policies: writes go through the service role only

-- Per-message opt-outs on the profile: {"return_due": false} means opted out. Money and dispute
-- messages ignore this map (lib/notifications/catalogue.ts decides which keys are optional).
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
