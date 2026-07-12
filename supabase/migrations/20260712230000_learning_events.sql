create table if not exists learn_chinese.learning_events (
  id uuid primary key,
  user_id uuid not null,
  session_id uuid,
  event_name text not null check (event_name in ('session_started', 'session_ended', 'review_completed')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (session_id, event_name)
);

create index if not exists learning_events_user_occurred_idx
  on learn_chinese.learning_events (user_id, occurred_at);
create index if not exists learning_events_name_occurred_idx
  on learn_chinese.learning_events (event_name, occurred_at);

alter table learn_chinese.learning_events enable row level security;

create policy learning_events_owner on learn_chinese.learning_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on learn_chinese.learning_events to authenticated;
grant all privileges on learn_chinese.learning_events to service_role;
