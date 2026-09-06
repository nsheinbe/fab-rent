-- provider_members: the owner-write policy used a direct sub-select on provider_members, which recurses
-- when the policy is evaluated for SELECT (FOR ALL policies apply to reads too). Route the check through
-- a SECURITY DEFINER helper like the other membership checks.
create or replace function public.is_provider_owner(p_provider uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.provider_members pm where pm.profile_id = auth.uid() and pm.provider_id = p_provider and pm.role = 'owner');
$$;

drop policy if exists pmembers_owner_write on public.provider_members;
create policy pmembers_owner_insert on public.provider_members for insert with check (public.is_provider_owner(provider_id) or public.is_staff());
create policy pmembers_owner_update on public.provider_members for update using (public.is_provider_owner(provider_id)) with check (public.is_provider_owner(provider_id));
create policy pmembers_owner_delete on public.provider_members for delete using (public.is_provider_owner(provider_id));
