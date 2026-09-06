-- Helper functions used by RLS policies and the app.

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff s where s.profile_id = auth.uid());
$$;

create or replace function public.is_service_role() returns boolean
language sql stable as $$
  select coalesce(auth.role() = 'service_role', false) or current_user = 'service_role';
$$;

create or replace function public.my_provider_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select pm.provider_id from public.provider_members pm where pm.profile_id = auth.uid();
$$;

create or replace function public.is_provider_member(p_provider uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.provider_members pm where pm.profile_id = auth.uid() and pm.provider_id = p_provider);
$$;

create or replace function public.owns_listing(p_listing uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.listings l join public.provider_members pm on pm.provider_id = l.provider_id
    where l.id = p_listing and pm.profile_id = auth.uid()
  );
$$;

create or replace function public.can_see_booking(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking
      and (b.renter_id = auth.uid() or public.is_provider_member(b.provider_id) or public.is_staff())
  );
$$;

-- Booking reference: FR-XXXX-XX using an unambiguous alphabet.
create or replace function public.gen_booking_ref() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  candidate text;
  i int;
begin
  loop
    candidate := 'FR-';
    for i in 1..4 loop candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    candidate := candidate || '-';
    for i in 1..2 loop candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.bookings where ref = candidate);
  end loop;
  return candidate;
end $$;

alter table public.bookings alter column ref set default public.gen_booking_ref();

-- Units of a listing that are free for a span (no blocking booking, no availability block, rentable).
create or replace function public.free_units(p_listing uuid, p_start timestamptz, p_end timestamptz, p_exclude_booking uuid default null)
returns setof uuid
language sql stable as $$
  select u.id
  from public.units u
  where u.listing_id = p_listing
    and u.status in ('rentable', 'service_due')
    and not exists (
      select 1 from public.availability_blocks ab
      where ab.listing_id = p_listing
        and (ab.unit_id is null or ab.unit_id = u.id)
        and ab.start_at < p_end and ab.end_at > p_start
    )
    and not exists (
      select 1 from public.bookings b
      where b.listing_id = p_listing
        and (p_exclude_booking is null or b.id <> p_exclude_booking)
        and b.status in ('requested','confirmed','ready_for_pickup','out_for_delivery','active','return_due','overdue')
        and (u.id = b.unit_id or u.id = any(b.unit_ids))
        and b.start_at < p_end and b.end_at > p_start
    );
$$;

-- Number of units free for a span, accounting for bookings that have no unit assigned yet (they still consume capacity).
create or replace function public.units_available(p_listing uuid, p_start timestamptz, p_end timestamptz)
returns integer
language sql stable as $$
  with free as (select count(*)::int as n from public.free_units(p_listing, p_start, p_end)),
  unassigned as (
    select coalesce(sum(b.qty), 0)::int as n from public.bookings b
    where b.listing_id = p_listing and b.unit_id is null and cardinality(b.unit_ids) = 0
      and b.status in ('requested','confirmed','ready_for_pickup','out_for_delivery','active','return_due','overdue')
      and b.start_at < p_end and b.end_at > p_start
  )
  select greatest(0, (select n from free) - (select n from unassigned));
$$;

-- Live marketplace config.
create or replace function public.live_config() returns jsonb
language sql stable as $$
  select config from public.marketplace_settings_versions where status = 'live' limit 1;
$$;

-- Keep listing/provider rating aggregates current when a review is published.
create or replace function public.refresh_ratings_for_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.published_at is null then return new; end if;
  if new.listing_id is not null then
    update public.listings l set
      rating = (select round(avg(item_stars)::numeric, 2) from public.reviews r where r.listing_id = l.id and r.published_at is not null and r.item_stars is not null),
      rating_count = (select count(*) from public.reviews r where r.listing_id = l.id and r.published_at is not null and r.item_stars is not null)
    where l.id = new.listing_id;
  end if;
  if new.provider_id is not null and new.author_side = 'renter' then
    update public.providers p set
      rating = (select round(avg(provider_stars)::numeric, 2) from public.reviews r where r.provider_id = p.id and r.published_at is not null and r.provider_stars is not null),
      rating_count = (select count(*) from public.reviews r where r.provider_id = p.id and r.published_at is not null and r.provider_stars is not null)
    where p.id = new.provider_id;
  end if;
  if new.renter_id is not null and new.author_side = 'provider' then
    update public.profiles pr set
      rating_from_providers = (select round(avg(renter_stars)::numeric, 2) from public.reviews r where r.renter_id = pr.id and r.published_at is not null and r.renter_stars is not null),
      rating_count = (select count(*) from public.reviews r where r.renter_id = pr.id and r.published_at is not null and r.renter_stars is not null)
    where pr.id = new.renter_id;
  end if;
  return new;
end $$;
create trigger reviews_refresh_ratings after insert or update of published_at on public.reviews for each row execute function public.refresh_ratings_for_review();

-- Conversation summary maintenance.
create or replace function public.after_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conversations c set
    last_message_at = new.created_at,
    last_message_preview = coalesce(new.body, case when new.kind = 'photo' then 'Photo' else '' end),
    renter_unread = case when new.sender_side = 'provider' then c.renter_unread + 1 else c.renter_unread end,
    provider_unread = case when new.sender_side = 'renter' then c.provider_unread + 1 else c.provider_unread end
  where c.id = new.conversation_id;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.after_message_insert();

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant insert, update on public.booking_drafts to anon;
grant insert on public.otp_codes to anon;
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
