-- =============================================================================
-- 0004_match_kb_chunks.sql
--
-- Day 4 retrieval helper:
--   - expose a small RPC for pgvector similarity search over kb_chunks
--   - used by lib/ai/rag.ts to fuse lexical search with vector search
-- =============================================================================

create or replace function public.match_kb_chunks(
  query_embedding vector(1024),
  match_count int default 8
)
returns table (
  id uuid,
  source_type text,
  source_id text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    kb.id,
    kb.source_type,
    kb.source_id,
    kb.content,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) as similarity
  from public.kb_chunks kb
  where kb.embedding is not null
  order by kb.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function public.match_kb_chunks(vector(1024), int) to anon, authenticated;
