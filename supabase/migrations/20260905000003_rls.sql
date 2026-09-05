-- Row Level Security on every table.
-- Renters see their own rows; provider members see rows for their provider; staff see everything;
-- anon can browse published listings, categories, providers and the live config.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_staff() or public.is_service_role());
create policy profiles_provider_read on public.profiles for select using (
  exists (select 1 from public.bookings b where b.renter_id = profiles.id and public.is_provider_member(b.provider_id))
  or exists (select 1 from public.conversations c where c.renter_id = profiles.id and public.is_provider_member(c.provider_id))
);
create policy profiles_public_read on public.profiles for select using (
  exists (select 1 from public.providers p where p.owner_profile_id = profiles.id)
);
create policy profiles_self_write on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_staff_write on public.profiles for all using (public.is_staff()) with check (public.is_staff());

-- payment methods
create policy pm_self on public.payment_methods for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy pm_staff on public.payment_methods for select using (public.is_staff());

-- providers
create policy providers_public on public.providers for select using (true);
create policy providers_member_write on public.providers for update using (public.is_provider_member(id)) with check (public.is_provider_member(id));
create policy providers_staff on public.providers for all using (public.is_staff()) with check (public.is_staff());

create policy pmembers_read on public.provider_members for select using (profile_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff());
create policy pmembers_owner_write on public.provider_members for all using (
  exists (select 1 from public.provider_members o where o.provider_id = provider_members.provider_id and o.profile_id = auth.uid() and o.role = 'owner')
) with check (
  exists (select 1 from public.provider_members o where o.provider_id = provider_members.provider_id and o.profile_id = auth.uid() and o.role = 'owner')
);
create policy pmembers_staff on public.provider_members for all using (public.is_staff()) with check (public.is_staff());

create policy staff_read_self on public.staff for select using (profile_id = auth.uid() or public.is_staff());
create policy staff_manage on public.staff for all using (public.is_staff()) with check (public.is_staff());

-- categories, policies, settings
create policy categories_public on public.categories for select using (true);
create policy categories_staff on public.categories for all using (public.is_staff()) with check (public.is_staff());
create policy policies_public on public.cancellation_policies for select using (true);
create policy policies_staff on public.cancellation_policies for all using (public.is_staff()) with check (public.is_staff());
create policy settings_live_public on public.marketplace_settings_versions for select using (status = 'live' or public.is_staff());
create policy settings_staff on public.marketplace_settings_versions for all using (public.is_staff()) with check (public.is_staff());

-- listings & children
create policy listings_public on public.listings for select using (status = 'published' or public.is_provider_member(provider_id) or public.is_staff());
create policy listings_provider_write on public.listings for all using (public.is_provider_member(provider_id)) with check (public.is_provider_member(provider_id));
create policy listings_staff on public.listings for all using (public.is_staff()) with check (public.is_staff());

create policy photos_read on public.listing_photos for select using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or public.is_provider_member(l.provider_id) or public.is_staff()))
);
create policy photos_write on public.listing_photos for all using (public.owns_listing(listing_id) or public.is_staff()) with check (public.owns_listing(listing_id) or public.is_staff());

create policy extras_read on public.listing_extras for select using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or public.is_provider_member(l.provider_id) or public.is_staff()))
);
create policy extras_write on public.listing_extras for all using (public.owns_listing(listing_id) or public.is_staff()) with check (public.owns_listing(listing_id) or public.is_staff());

create policy docs_read on public.listing_documents for select using (public.owns_listing(listing_id) or public.is_staff());
create policy docs_write on public.listing_documents for all using (public.owns_listing(listing_id) or public.is_staff()) with check (public.owns_listing(listing_id) or public.is_staff());

create policy units_read on public.units for select using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or public.is_provider_member(l.provider_id) or public.is_staff()))
);
create policy units_write on public.units for all using (public.owns_listing(listing_id) or public.is_staff()) with check (public.owns_listing(listing_id) or public.is_staff());

create policy blocks_read on public.availability_blocks for select using (
  exists (select 1 from public.listings l where l.id = listing_id and (l.status = 'published' or public.is_provider_member(l.provider_id) or public.is_staff()))
);
create policy blocks_write on public.availability_blocks for all using (public.owns_listing(listing_id) or public.is_staff()) with check (public.owns_listing(listing_id) or public.is_staff());

-- drafts: anonymous drafts are addressed by key (the app layer holds the key); signed-in drafts by profile
create policy drafts_owner on public.booking_drafts for all using (
  (profile_id is not null and profile_id = auth.uid())
  or (profile_id is null and anonymous_key is not null and anonymous_key = current_setting('app.anonymous_key', true))
  or public.is_staff()
) with check (
  (profile_id is not null and profile_id = auth.uid())
  or (profile_id is null and anonymous_key is not null and anonymous_key = current_setting('app.anonymous_key', true))
  or public.is_staff()
);

-- bookings & children
create policy bookings_read on public.bookings for select using (renter_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff());
create policy bookings_renter_insert on public.bookings for insert with check (renter_id = auth.uid() or public.is_staff());
create policy bookings_update on public.bookings for update using (renter_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff())
  with check (renter_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff());

create policy bextras_read on public.booking_extras for select using (public.can_see_booking(booking_id));
create policy bextras_write on public.booking_extras for all using (public.can_see_booking(booking_id)) with check (public.can_see_booking(booking_id));
create policy bevents_read on public.booking_events for select using (public.can_see_booking(booking_id));
create policy bevents_write on public.booking_events for insert with check (public.can_see_booking(booking_id));

create policy condition_read on public.condition_records for select using (public.can_see_booking(booking_id));
create policy condition_write on public.condition_records for all using (
  exists (select 1 from public.bookings b where b.id = booking_id and (public.is_provider_member(b.provider_id) or public.is_staff()))
) with check (
  exists (select 1 from public.bookings b where b.id = booking_id and (public.is_provider_member(b.provider_id) or public.is_staff()))
);

create policy claims_read on public.claims for select using (public.can_see_booking(booking_id));
create policy claims_write on public.claims for all using (public.can_see_booking(booking_id)) with check (public.can_see_booking(booking_id));

create policy disputes_read on public.disputes for select using (public.can_see_booking(booking_id));
create policy disputes_party_write on public.disputes for update using (public.can_see_booking(booking_id)) with check (public.can_see_booking(booking_id));
create policy disputes_insert on public.disputes for insert with check (public.can_see_booking(booking_id));
create policy disputes_staff on public.disputes for all using (public.is_staff()) with check (public.is_staff());

create policy ext_read on public.extension_requests for select using (public.can_see_booking(booking_id));
create policy ext_write on public.extension_requests for all using (public.can_see_booking(booking_id)) with check (public.can_see_booking(booking_id));

-- messaging
create policy conv_read on public.conversations for select using (renter_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff());
create policy conv_write on public.conversations for all using (renter_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff())
  with check (renter_id = auth.uid() or public.is_provider_member(provider_id) or public.is_staff());
create policy msg_read on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.renter_id = auth.uid() or public.is_provider_member(c.provider_id) or public.is_staff()))
);
create policy msg_write on public.messages for all using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.renter_id = auth.uid() or public.is_provider_member(c.provider_id) or public.is_staff()))
) with check (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.renter_id = auth.uid() or public.is_provider_member(c.provider_id) or public.is_staff()))
);

-- reviews: published reviews are public; authors and parties see their own
create policy reviews_read on public.reviews for select using (published_at is not null or author_id = auth.uid() or public.can_see_booking(booking_id));
create policy reviews_write on public.reviews for insert with check (author_id = auth.uid() and public.can_see_booking(booking_id));
create policy reviews_update on public.reviews for update using (author_id = auth.uid() or public.is_staff()) with check (author_id = auth.uid() or public.is_staff());

-- money
create policy ledger_read on public.ledger_entries for select using (public.is_provider_member(provider_id) or public.is_staff());
create policy ledger_staff on public.ledger_entries for all using (public.is_staff()) with check (public.is_staff());
create policy payouts_read on public.payouts for select using (public.is_provider_member(provider_id) or public.is_staff());
create policy payouts_staff on public.payouts for all using (public.is_staff()) with check (public.is_staff());
create policy credits_read on public.renter_credits for select using (profile_id = auth.uid() or public.is_staff());
create policy credits_staff on public.renter_credits for all using (public.is_staff()) with check (public.is_staff());

-- saved
create policy saved_self on public.saved_listings for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- review queue, admin, notes, reports
create policy lreviews_read on public.listing_reviews for select using (public.owns_listing(listing_id) or public.is_staff());
create policy lreviews_provider_insert on public.listing_reviews for insert with check (public.owns_listing(listing_id) or public.is_staff());
create policy lreviews_staff on public.listing_reviews for all using (public.is_staff()) with check (public.is_staff());
create policy admin_actions_staff on public.admin_actions for all using (public.is_staff()) with check (public.is_staff());
create policy notes_staff on public.internal_notes for all using (public.is_staff()) with check (public.is_staff());
create policy reports_insert on public.reports for insert with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select using (reporter_id = auth.uid() or public.is_staff());
create policy reports_staff on public.reports for all using (public.is_staff()) with check (public.is_staff());
create policy otp_service on public.otp_codes for all using (public.is_service_role() or public.is_staff()) with check (public.is_service_role() or public.is_staff());

-- storage object policies (Supabase): public read of listing photos, private buckets via signed URLs only
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $p$create policy "listing photos are public" on storage.objects for select using (bucket_id = 'listing-photos')$p$;
    execute $p$create policy "providers upload listing photos" on storage.objects for insert to authenticated with check (bucket_id = 'listing-photos')$p$;
    execute $p$create policy "parties read condition photos" on storage.objects for select to authenticated using (bucket_id in ('condition-photos','evidence'))$p$;
    execute $p$create policy "parties upload condition photos" on storage.objects for insert to authenticated with check (bucket_id in ('condition-photos','evidence'))$p$;
  end if;
end $$;
