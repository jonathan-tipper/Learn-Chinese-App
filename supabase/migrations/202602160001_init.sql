-- v0.1 core schema for Learn Chinese app

create table if not exists profiles (
  user_id uuid primary key,
  goals jsonb not null default '[]'::jsonb,
  level text not null,
  preferences jsonb not null default '{}'::jsonb,
  timezone text not null default 'UTC',
  coach_style text not null default 'friendly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  mode text not null,
  summary text,
  metrics_json jsonb not null default '{}'::jsonb
);
create index if not exists sessions_user_started_idx on sessions(user_id, started_at desc);

create table if not exists messages (
  id uuid primary key,
  session_id uuid not null,
  role text not null,
  content text not null,
  tokens int,
  created_at timestamptz not null default now()
);
create index if not exists messages_session_created_idx on messages(session_id, created_at);

create table if not exists memories (
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
create index if not exists memories_user_active_idx on memories(user_id, deleted_at, updated_at desc);

create table if not exists memory_events (
  id uuid primary key,
  memory_id uuid not null,
  action text not null,
  reason text,
  agent_run_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists vocab_items (
  id uuid primary key,
  user_id uuid not null,
  hanzi text not null,
  pinyin text,
  english text,
  tags jsonb not null default '[]'::jsonb,
  source_session_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists srs_cards (
  id uuid primary key,
  user_id uuid not null,
  type text not null default 'vocab',
  prompt text not null,
  answer text not null,
  hints jsonb not null default '[]'::jsonb,
  ease numeric not null default 2.5,
  interval int not null default 1,
  next_due_at timestamptz not null,
  last_result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists srs_cards_user_due_idx on srs_cards(user_id, next_due_at);

create table if not exists grammar_points (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  explanation text not null,
  examples_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
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

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table messages enable row level security;
alter table memories enable row level security;
alter table memory_events enable row level security;
alter table vocab_items enable row level security;
alter table srs_cards enable row level security;
alter table grammar_points enable row level security;
alter table agent_runs enable row level security;

create policy if not exists profiles_owner on profiles using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists sessions_owner on sessions using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists memories_owner on memories using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists vocab_owner on vocab_items using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists srs_owner on srs_cards using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists grammar_owner on grammar_points using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy if not exists runs_owner on agent_runs using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- messages access via parent session ownership
create policy if not exists messages_owner on messages using (
  exists (select 1 from sessions s where s.id = messages.session_id and s.user_id = auth.uid())
) with check (
  exists (select 1 from sessions s where s.id = messages.session_id and s.user_id = auth.uid())
);

-- memory_events access via memory ownership
create policy if not exists memory_events_owner on memory_events using (
  exists (select 1 from memories m where m.id = memory_events.memory_id and m.user_id = auth.uid())
) with check (
  exists (select 1 from memories m where m.id = memory_events.memory_id and m.user_id = auth.uid())
);
