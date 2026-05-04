-- =============================================================================
-- Switch from Voyage AI (1024-d) to local Transformers.js (384-d) embeddings.
-- Migration: 0007_embeddings_384d.sql
--
-- pgvector does not support ALTER COLUMN to change vector dimensions,
-- so we drop and recreate the affected columns and their ivfflat indexes.
-- All existing embedding values are discarded (NULL); they will be
-- re-generated lazily on next use (RAG ingest, summary regeneration).
-- =============================================================================

-- schematics.summary_embedding -----------------------------------------------
drop index if exists public.schematics_summary_emb_idx;
alter table public.schematics drop column if exists summary_embedding;
alter table public.schematics add column summary_embedding vector(384);
create index schematics_summary_emb_idx on public.schematics
  using ivfflat (summary_embedding vector_cosine_ops) with (lists = 100);

-- components.embedding --------------------------------------------------------
drop index if exists public.components_embedding_idx;
alter table public.components drop column if exists embedding;
alter table public.components add column embedding vector(384);
create index components_embedding_idx on public.components
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- kb_chunks.embedding ---------------------------------------------------------
drop index if exists public.kb_chunks_embedding_idx;
alter table public.kb_chunks drop column if exists embedding;
alter table public.kb_chunks add column embedding vector(384);
create index kb_chunks_embedding_idx on public.kb_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 200);

-- Update match_kb_chunks() to use 384-d parameter ----------------------------
create or replace function public.match_kb_chunks(
  query_embedding vector(384),
  match_count     int default 12
)
returns table (
  id          uuid,
  source_type text,
  source_id   text,
  content     text,
  metadata    jsonb,
  similarity  float
)
language sql stable
as $$
  select
    id,
    source_type,
    source_id,
    content,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from public.kb_chunks
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Grant execute to authenticated users so RLS applies -------------------------
grant execute on function public.match_kb_chunks(vector(384), int) to authenticated, anon;
