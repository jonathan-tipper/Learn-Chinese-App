-- Sessions were only closed when the learner pressed "End", so almost every real session
-- stayed open and streaks/minutes never counted. Close historical sessions that had chat
-- activity using their last message time, and record message counts for the progress math.
with activity as (
  select
    m.session_id,
    count(*) as message_count,
    min(m.created_at) as first_at,
    max(m.created_at) as last_at
  from learn_chinese.messages m
  join learn_chinese.sessions s on s.id = m.session_id
  where s.ended_at is null
  group by m.session_id
)
update learn_chinese.sessions as s
set
  ended_at = a.last_at,
  summary = coalesce(s.summary, 'Practice session (closed automatically)'),
  metrics_json = coalesce(s.metrics_json, '{}'::jsonb) || jsonb_build_object(
    'durationSec', least(10800, greatest(60, extract(epoch from (a.last_at - s.started_at))::int + 60)),
    'messageCount', a.message_count,
    'lastActivityAt', a.last_at,
    'autoClosed', true
  )
from activity a
where s.id = a.session_id
  and a.last_at < now() - interval '30 minutes';

-- Sessions that never had a message are not practice; drop them so they do not skew totals.
delete from learn_chinese.sessions s
where s.ended_at is null
  and s.started_at < now() - interval '1 day'
  and not exists (select 1 from learn_chinese.messages m where m.session_id = s.id)
  and coalesce(s.metrics_json -> 'tonePracticeAttempts', '[]'::jsonb) = '[]'::jsonb;
