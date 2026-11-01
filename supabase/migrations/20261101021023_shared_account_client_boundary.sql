-- Non-secret operator configuration for app-bound RLS, outside exposed schemas.
-- Existing direct sessions stay available until compatibility is explicitly closed.
-- OAuth clients are denied until the operator registers the exact app client ID.

create schema if not exists learn_chinese_private;
revoke all on schema learn_chinese_private from public, anon, authenticated;
grant usage on schema learn_chinese_private to authenticated, service_role;

create table if not exists learn_chinese_private.auth_client_settings (
  singleton integer primary key default 1 check (singleton = 1),
  oauth_client_id uuid,
  allow_legacy_sessions boolean not null default true
);
alter table learn_chinese_private.auth_client_settings enable row level security;
revoke all on table learn_chinese_private.auth_client_settings from public, anon, authenticated;
grant select on table learn_chinese_private.auth_client_settings to authenticated;
grant all privileges on table learn_chinese_private.auth_client_settings to service_role;

-- This row contains only the non-secret public client ID and a compatibility
-- switch. Authenticated SELECT is intentional for invoker policy evaluation;
-- no authenticated INSERT/UPDATE/DELETE is granted. Never expose this schema.
do $settings$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'learn_chinese_private'
      and tablename = 'auth_client_settings' and policyname = 'read_non_secret_app_settings'
  ) then
    create policy read_non_secret_app_settings
      on learn_chinese_private.auth_client_settings
      for select to authenticated using (true);
  end if;
end
$settings$;
insert into learn_chinese_private.auth_client_settings (singleton)
values (1) on conflict (singleton) do nothing;

do $migration$
declare
  app_table text;
  client_condition text := $condition$
    (
      (select auth.jwt() ->> 'client_id') =
        (select oauth_client_id::text from learn_chinese_private.auth_client_settings where singleton = 1)
      or (
        (select auth.jwt() ->> 'client_id') is null
        and (select allow_legacy_sessions from learn_chinese_private.auth_client_settings where singleton = 1)
      )
    )
  $condition$;
begin
  for app_table in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'learn_chinese' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    if exists (
      select 1 from pg_policies where schemaname = 'learn_chinese'
        and tablename = app_table and policyname = 'shared_account_client_boundary'
    ) then
      execute format('alter policy shared_account_client_boundary on learn_chinese.%I using (%s) with check (%s)',
        app_table, client_condition, client_condition);
    else
      execute format('create policy shared_account_client_boundary on learn_chinese.%I as restrictive for all to authenticated using (%s) with check (%s)',
        app_table, client_condition, client_condition);
    end if;
  end loop;
end
$migration$;
