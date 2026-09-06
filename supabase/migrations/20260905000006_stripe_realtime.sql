-- Stripe customer per profile (payment methods are attached to it so holds/charges can run off-session).
alter table public.profiles add column if not exists stripe_customer_id text;

-- Realtime for the inbox: the thread subscribes to inserts on messages when Supabase is configured.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.messages;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
