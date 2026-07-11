alter table learn_chinese.agent_runs
  add column if not exists provider text,
  add column if not exists tokens int not null default 0;

create index if not exists agent_runs_user_session_created_idx
  on learn_chinese.agent_runs (user_id, session_id, created_at desc);
