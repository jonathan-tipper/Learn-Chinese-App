-- Tune public-schema RLS policies:
-- - Add explicit deny policy for VerificationToken (removes "RLS enabled, no policy" lint).
-- - Rewrite auth expressions with (select auth.uid()) for policy initplan optimization.

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'User' and policyname = 'user_self'
  ) then
    alter policy user_self on public."User"
      using (id = ((select auth.uid())::text))
      with check (id = ((select auth.uid())::text));
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Account' and policyname = 'account_owner'
  ) then
    alter policy account_owner on public."Account"
      using ("userId" = ((select auth.uid())::text))
      with check ("userId" = ((select auth.uid())::text));
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Session' and policyname = 'session_owner'
  ) then
    alter policy session_owner on public."Session"
      using ("userId" = ((select auth.uid())::text))
      with check ("userId" = ((select auth.uid())::text));
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Service' and policyname = 'service_owner'
  ) then
    alter policy service_owner on public."Service"
      using ("userId" = ((select auth.uid())::text))
      with check ("userId" = ((select auth.uid())::text));
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Transaction' and policyname = 'transaction_owner'
  ) then
    alter policy transaction_owner on public."Transaction"
      using ("userId" = ((select auth.uid())::text))
      with check ("userId" = ((select auth.uid())::text));
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'Integration' and policyname = 'integration_owner'
  ) then
    alter policy integration_owner on public."Integration"
      using ("userId" = ((select auth.uid())::text))
      with check ("userId" = ((select auth.uid())::text));
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'CsvImportLog' and policyname = 'csv_import_log_owner'
  ) then
    alter policy csv_import_log_owner on public."CsvImportLog"
      using ("userId" = ((select auth.uid())::text))
      with check ("userId" = ((select auth.uid())::text));
  end if;

  if to_regclass('public."VerificationToken"') is not null and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'VerificationToken' and policyname = 'verification_token_no_access'
  ) then
    create policy verification_token_no_access on public."VerificationToken"
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;
end
$$;
