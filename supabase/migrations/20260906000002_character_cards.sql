-- Shared cache of AI-generated character cards (radicals, mnemonics, common words).
-- Content is not learner-specific, so one row per entry is cached for everyone.
create table if not exists learn_chinese.character_cards (
  entry text primary key,
  card_json jsonb not null,
  generated_by text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table learn_chinese.character_cards enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'character_cards' and policyname = 'character_cards_read'
  ) then
    create policy character_cards_read on learn_chinese.character_cards
      for select to authenticated
      using (true);
  end if;
end
$$;

grant select on learn_chinese.character_cards to authenticated;
grant all privileges on learn_chinese.character_cards to service_role;
