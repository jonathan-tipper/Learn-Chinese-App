-- Push subscription storage for Web Push / VAPID streak reminders.
-- Follows the same pattern as all other learn_chinese schema tables:
--   • explicit schema prefix
--   • RLS enabled with (select auth.uid()) subquery for performance
--   • grants for authenticated and service_role

create table if not exists learn_chinese.push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null,
  p256dh     text        not null,
  auth       text        not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table learn_chinese.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese'
      and tablename  = 'push_subscriptions'
      and policyname = 'push_subs_owner'
  ) then
    create policy push_subs_owner on learn_chinese.push_subscriptions
      for all
      using      ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end
$$;

grant select, insert, update, delete
  on learn_chinese.push_subscriptions to authenticated;
grant all privileges
  on learn_chinese.push_subscriptions to service_role;
