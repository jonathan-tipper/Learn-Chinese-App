-- Security hardening for shared Supabase projects:
-- 1) Enable RLS on exposed public tables and add least-privilege policies.
-- 2) Optimize learn_chinese RLS policies to avoid per-row auth function re-evaluation.

-- Public schema tables flagged by security advisors.
alter table if exists public."ExchangeRate" enable row level security;
alter table if exists public."User" enable row level security;
alter table if exists public."Account" enable row level security;
alter table if exists public."Session" enable row level security;
alter table if exists public."Service" enable row level security;
alter table if exists public."Transaction" enable row level security;
alter table if exists public."Integration" enable row level security;
alter table if exists public."CsvImportLog" enable row level security;
alter table if exists public."VerificationToken" enable row level security;

do $$
begin
  -- Keep non-sensitive exchange-rate reads available.
  if to_regclass('public."ExchangeRate"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'ExchangeRate' and policyname = 'exchange_rate_read'
  ) then
    create policy exchange_rate_read on public."ExchangeRate"
      for select
      to anon, authenticated
      using (true);
  end if;

  -- User-owned app tables in public schema.
  if to_regclass('public."User"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'User' and policyname = 'user_self'
  ) then
    create policy user_self on public."User"
      for all
      to authenticated
      using (id = (select auth.jwt() ->> 'sub'))
      with check (id = (select auth.jwt() ->> 'sub'));
  end if;

  if to_regclass('public."Account"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Account' and policyname = 'account_owner'
  ) then
    create policy account_owner on public."Account"
      for all
      to authenticated
      using ("userId" = (select auth.jwt() ->> 'sub'))
      with check ("userId" = (select auth.jwt() ->> 'sub'));
  end if;

  if to_regclass('public."Session"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Session' and policyname = 'session_owner'
  ) then
    create policy session_owner on public."Session"
      for all
      to authenticated
      using ("userId" = (select auth.jwt() ->> 'sub'))
      with check ("userId" = (select auth.jwt() ->> 'sub'));
  end if;

  if to_regclass('public."Service"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Service' and policyname = 'service_owner'
  ) then
    create policy service_owner on public."Service"
      for all
      to authenticated
      using ("userId" = (select auth.jwt() ->> 'sub'))
      with check ("userId" = (select auth.jwt() ->> 'sub'));
  end if;

  if to_regclass('public."Transaction"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Transaction' and policyname = 'transaction_owner'
  ) then
    create policy transaction_owner on public."Transaction"
      for all
      to authenticated
      using ("userId" = (select auth.jwt() ->> 'sub'))
      with check ("userId" = (select auth.jwt() ->> 'sub'));
  end if;

  if to_regclass('public."Integration"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Integration' and policyname = 'integration_owner'
  ) then
    create policy integration_owner on public."Integration"
      for all
      to authenticated
      using ("userId" = (select auth.jwt() ->> 'sub'))
      with check ("userId" = (select auth.jwt() ->> 'sub'));
  end if;

  if to_regclass('public."CsvImportLog"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'CsvImportLog' and policyname = 'csv_import_log_owner'
  ) then
    create policy csv_import_log_owner on public."CsvImportLog"
      for all
      to authenticated
      using ("userId" = (select auth.jwt() ->> 'sub'))
      with check ("userId" = (select auth.jwt() ->> 'sub'));
  end if;
end
$$;

-- RLS policy performance optimization in learn_chinese schema.
alter policy profiles_owner on learn_chinese.profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy sessions_owner on learn_chinese.sessions
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy memories_owner on learn_chinese.memories
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy vocab_owner on learn_chinese.vocab_items
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy srs_owner on learn_chinese.srs_cards
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy grammar_owner on learn_chinese.grammar_points
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy runs_owner on learn_chinese.agent_runs
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy messages_owner on learn_chinese.messages
  using (
    exists (
      select 1
      from learn_chinese.sessions s
      where s.id = messages.session_id and s.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from learn_chinese.sessions s
      where s.id = messages.session_id and s.user_id = (select auth.uid())
    )
  );

alter policy memory_events_owner on learn_chinese.memory_events
  using (
    exists (
      select 1
      from learn_chinese.memories m
      where m.id = memory_events.memory_id and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from learn_chinese.memories m
      where m.id = memory_events.memory_id and m.user_id = (select auth.uid())
    )
  );
