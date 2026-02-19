-- Isolate Learn Chinese app data in a dedicated schema for shared Supabase projects.

create schema if not exists learn_chinese;

do $$
begin
  if to_regclass('public.profiles') is not null and to_regclass('learn_chinese.profiles') is null then
    execute 'alter table public.profiles set schema learn_chinese';
  end if;
  if to_regclass('public.sessions') is not null and to_regclass('learn_chinese.sessions') is null then
    execute 'alter table public.sessions set schema learn_chinese';
  end if;
  if to_regclass('public.messages') is not null and to_regclass('learn_chinese.messages') is null then
    execute 'alter table public.messages set schema learn_chinese';
  end if;
  if to_regclass('public.memories') is not null and to_regclass('learn_chinese.memories') is null then
    execute 'alter table public.memories set schema learn_chinese';
  end if;
  if to_regclass('public.memory_events') is not null and to_regclass('learn_chinese.memory_events') is null then
    execute 'alter table public.memory_events set schema learn_chinese';
  end if;
  if to_regclass('public.vocab_items') is not null and to_regclass('learn_chinese.vocab_items') is null then
    execute 'alter table public.vocab_items set schema learn_chinese';
  end if;
  if to_regclass('public.srs_cards') is not null and to_regclass('learn_chinese.srs_cards') is null then
    execute 'alter table public.srs_cards set schema learn_chinese';
  end if;
  if to_regclass('public.grammar_points') is not null and to_regclass('learn_chinese.grammar_points') is null then
    execute 'alter table public.grammar_points set schema learn_chinese';
  end if;
  if to_regclass('public.agent_runs') is not null and to_regclass('learn_chinese.agent_runs') is null then
    execute 'alter table public.agent_runs set schema learn_chinese';
  end if;
end
$$;

create table if not exists learn_chinese.profiles (
  user_id uuid primary key,
  goals jsonb not null default '[]'::jsonb,
  level text not null,
  preferences jsonb not null default '{}'::jsonb,
  timezone text not null default 'UTC',
  coach_style text not null default 'friendly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists learn_chinese.sessions (
  id uuid primary key,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  mode text not null,
  summary text,
  metrics_json jsonb not null default '{}'::jsonb
);
create index if not exists learn_chinese_sessions_user_started_idx
  on learn_chinese.sessions(user_id, started_at desc);

create table if not exists learn_chinese.messages (
  id uuid primary key,
  session_id uuid not null,
  role text not null,
  content text not null,
  tokens int,
  created_at timestamptz not null default now()
);
create index if not exists learn_chinese_messages_session_created_idx
  on learn_chinese.messages(session_id, created_at);

create table if not exists learn_chinese.memories (
  id uuid primary key,
  user_id uuid not null,
  type text not null,
  key text not null,
  value_json jsonb not null,
  confidence numeric not null default 0.7,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists learn_chinese_memories_user_active_idx
  on learn_chinese.memories(user_id, deleted_at, updated_at desc);

create table if not exists learn_chinese.memory_events (
  id uuid primary key,
  memory_id uuid not null,
  action text not null,
  reason text,
  agent_run_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists learn_chinese.vocab_items (
  id uuid primary key,
  user_id uuid not null,
  hanzi text not null,
  pinyin text,
  english text,
  tags jsonb not null default '[]'::jsonb,
  source_session_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists learn_chinese.srs_cards (
  id uuid primary key,
  user_id uuid not null,
  type text not null default 'vocab',
  prompt text not null,
  answer text not null,
  hints jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  ease numeric not null default 2.5,
  interval int not null default 1,
  next_due_at timestamptz not null,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learn_chinese_srs_cards_user_due_idx
  on learn_chinese.srs_cards(user_id, next_due_at);

create table if not exists learn_chinese.grammar_points (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  explanation text not null,
  examples_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists learn_chinese.agent_runs (
  id uuid primary key,
  user_id uuid not null,
  session_id uuid,
  graph_name text,
  node_name text,
  input_hash text,
  output_hash text,
  cost_estimate numeric,
  latency_ms int,
  created_at timestamptz not null default now()
);

alter table learn_chinese.profiles enable row level security;
alter table learn_chinese.sessions enable row level security;
alter table learn_chinese.messages enable row level security;
alter table learn_chinese.memories enable row level security;
alter table learn_chinese.memory_events enable row level security;
alter table learn_chinese.vocab_items enable row level security;
alter table learn_chinese.srs_cards enable row level security;
alter table learn_chinese.grammar_points enable row level security;
alter table learn_chinese.agent_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'profiles' and policyname = 'profiles_owner'
  ) then
    create policy profiles_owner on learn_chinese.profiles
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'sessions' and policyname = 'sessions_owner'
  ) then
    create policy sessions_owner on learn_chinese.sessions
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'memories' and policyname = 'memories_owner'
  ) then
    create policy memories_owner on learn_chinese.memories
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'vocab_items' and policyname = 'vocab_owner'
  ) then
    create policy vocab_owner on learn_chinese.vocab_items
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'srs_cards' and policyname = 'srs_owner'
  ) then
    create policy srs_owner on learn_chinese.srs_cards
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'grammar_points' and policyname = 'grammar_owner'
  ) then
    create policy grammar_owner on learn_chinese.grammar_points
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'agent_runs' and policyname = 'runs_owner'
  ) then
    create policy runs_owner on learn_chinese.agent_runs
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'messages' and policyname = 'messages_owner'
  ) then
    create policy messages_owner on learn_chinese.messages
      using (
        exists (
          select 1
          from learn_chinese.sessions s
          where s.id = messages.session_id and s.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from learn_chinese.sessions s
          where s.id = messages.session_id and s.user_id = auth.uid()
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'learn_chinese' and tablename = 'memory_events' and policyname = 'memory_events_owner'
  ) then
    create policy memory_events_owner on learn_chinese.memory_events
      using (
        exists (
          select 1
          from learn_chinese.memories m
          where m.id = memory_events.memory_id and m.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1
          from learn_chinese.memories m
          where m.id = memory_events.memory_id and m.user_id = auth.uid()
        )
      );
  end if;
end
$$;

grant usage on schema learn_chinese to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema learn_chinese to authenticated;
grant all privileges on all tables in schema learn_chinese to service_role;
alter default privileges in schema learn_chinese
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema learn_chinese
  grant all privileges on tables to service_role;
