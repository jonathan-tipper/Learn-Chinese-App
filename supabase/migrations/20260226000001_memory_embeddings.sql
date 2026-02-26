-- Enable pgvector for semantic similarity search on memories.
-- This powers context-aware memory retrieval in the tutor agent:
-- instead of grabbing the 5 most-recent memories, the contextLoader
-- now fetches the memories most semantically relevant to the current message.

create extension if not exists vector;

-- Add embedding column (text-embedding-ada-002 / text-embedding-3-small: 1536 dims).
alter table learn_chinese.memories
  add column if not exists embedding vector(1536);

-- HNSW index — fast approximate cosine-distance lookups.
create index if not exists learn_chinese_memories_embedding_hnsw_idx
  on learn_chinese.memories
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- RPC helper so the Supabase client can query across the learn_chinese schema.
-- Returns memories ordered by cosine similarity (highest first).
create or replace function learn_chinese.match_memories(
  query_embedding vector(1536),
  p_user_id       uuid,
  match_count     int default 5
)
returns table (
  id          uuid,
  user_id     uuid,
  type        text,
  key         text,
  value_json  jsonb,
  confidence  numeric,
  source      text,
  created_at  timestamptz,
  updated_at  timestamptz,
  deleted_at  timestamptz,
  similarity  float
)
language sql stable
as $$
  select
    m.id,
    m.user_id,
    m.type,
    m.key,
    m.value_json,
    m.confidence,
    m.source,
    m.created_at,
    m.updated_at,
    m.deleted_at,
    1 - (m.embedding <=> query_embedding) as similarity
  from learn_chinese.memories m
  where
    m.user_id    = p_user_id
    and m.deleted_at is null
    and m.embedding  is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- Grant execute to service_role so server-side calls work.
grant execute on function learn_chinese.match_memories(vector(1536), uuid, int)
  to service_role;
