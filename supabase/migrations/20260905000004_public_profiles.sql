-- Public, non-sensitive projection of profiles for anonymous surfaces (listing reviews, provider cards).
-- The view is owned by the migration role and therefore bypasses profiles RLS for these columns only;
-- email, phone, flags, status and verification method never leave the base table.
create view public.public_profiles as
select
  p.id,
  p.name,
  p.neighbourhood,
  p.avatar_path,
  p.is_business,
  p.rating_from_providers,
  p.rating_count,
  p.completed_count,
  p.joined_at
from public.profiles p
where p.status <> 'suspended';

comment on view public.public_profiles is 'Safe public columns of profiles; used for review authors and provider owners.';

grant select on public.public_profiles to anon, authenticated, service_role;
