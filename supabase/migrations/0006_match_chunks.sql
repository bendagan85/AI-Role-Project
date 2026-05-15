-- 0006_match_chunks.sql
-- Hybrid retrieval: dense (pgvector cosine) + sparse (Postgres FTS), fused
-- with Reciprocal Rank Fusion (RRF). Returns top-k chunks for a tenant.
--
-- RRF formula: score = sum_over_lists(1 / (60 + rank_in_list)).
-- The constant 60 is the standard "k" value from the original RRF paper.
-- Both lists pull up to 25 candidates each (more recall than we need),
-- then the fusion ranks them.
--
-- This is a SECURITY DEFINER function so it can read chunks across the
-- tenant filter. We still pass tenant_id and filter explicitly inside —
-- the function is server-only and the caller's session-derived tenant_id
-- is the source of truth.

create or replace function match_chunks(
  query_embedding vector(1536),
  query_text text,
  match_tenant_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  token_count int,
  document_title text,
  document_source_type text,
  document_source_url text,
  cosine_similarity real,
  rrf_score real
)
language sql
stable
security definer
set search_path = public
as $$
  with semantic as (
    select
      c.id,
      1 - (c.embedding <=> query_embedding) as similarity,
      row_number() over (order by c.embedding <=> query_embedding) as rank
    from chunks c
    where c.tenant_id = match_tenant_id
    order by c.embedding <=> query_embedding
    limit 25
  ),
  keyword as (
    select
      c.id,
      ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) as score,
      row_number() over (
        order by ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) desc
      ) as rank
    from chunks c
    where c.tenant_id = match_tenant_id
      and c.tsv @@ websearch_to_tsquery('english', query_text)
    order by ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) desc
    limit 25
  ),
  fused as (
    select
      coalesce(s.id, k.id) as id,
      coalesce(1.0 / (60 + s.rank), 0.0) + coalesce(1.0 / (60 + k.rank), 0.0) as rrf_score,
      s.similarity as cosine_similarity
    from semantic s
    full outer join keyword k on s.id = k.id
  )
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    c.metadata,
    c.token_count,
    d.title              as document_title,
    d.source_type        as document_source_type,
    d.source_url         as document_source_url,
    coalesce(f.cosine_similarity, 0)::real as cosine_similarity,
    f.rrf_score::real    as rrf_score
  from fused f
  join chunks c    on c.id = f.id
  join documents d on d.id = c.document_id
  where c.tenant_id = match_tenant_id
  order by f.rrf_score desc
  limit match_count;
$$;

grant execute on function match_chunks(vector, text, uuid, int) to authenticated, service_role;
