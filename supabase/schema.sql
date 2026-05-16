-- ============================================================
-- AI Coach — full database schema (generated, do not edit here)
-- One-paste setup: copy ALL of this into the Supabase SQL Editor
-- and Run. Equivalent to applying supabase/migrations/0001..0007
-- in order. Source of truth is the individual migration files.
-- ============================================================


-- ----------------------------------------------------------------
-- supabase/migrations/0001_init.sql
-- ----------------------------------------------------------------

-- 0001_init.sql
-- Extensions, tables, indexes, updated_at triggers.

create extension if not exists vector;
create extension if not exists pg_trgm;

-- =====================================================================
-- tenants: 1:1 with auth.users. Holds the per-coach agent configuration.
-- =====================================================================
create table tenants (
  id                  uuid primary key references auth.users(id) on delete cascade,
  name                text not null,
  agent_persona       text not null,
  agent_system_prompt text not null,
  llm_model           text not null default 'claude-sonnet-4-6',
  temperature         real not null default 0.3 check (temperature >= 0 and temperature <= 1),
  retrieval_k         int  not null default 8   check (retrieval_k >= 1 and retrieval_k <= 50),
  created_at          timestamptz not null default now()
);

-- =====================================================================
-- documents: one row per uploaded source (file / URL / pasted text).
-- =====================================================================
create table documents (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  title             text not null,
  source_type       text not null check (source_type in ('file', 'url', 'text')),
  source_url        text,
  original_filename text,
  mime_type         text,
  status            text not null default 'pending'
                      check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message     text,
  chunk_count       int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =====================================================================
-- chunks: text shards with embeddings + FTS, used by hybrid retrieval.
-- =====================================================================
create table chunks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  document_id  uuid not null references documents(id) on delete cascade,
  chunk_index  int  not null,
  content      text not null,
  metadata     jsonb not null default '{}'::jsonb,
  embedding    vector(1536) not null,
  tsv          tsvector generated always as (to_tsvector('english', content)) stored,
  token_count  int  not null
);

-- =====================================================================
-- conversations: chat sessions, optionally with a user profile (bonus).
-- =====================================================================
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_profile  jsonb not null default '{}'::jsonb,
  title         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- =====================================================================
-- messages: one row per chat turn. citations is a JSON array of refs.
-- =====================================================================
create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  citations       jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

-- =====================================================================
-- Indexes
-- =====================================================================
create index documents_tenant_idx        on documents(tenant_id);
create index documents_tenant_status_idx on documents(tenant_id, status);
create index chunks_tenant_idx           on chunks(tenant_id);
create index chunks_document_idx         on chunks(document_id);
create index chunks_embedding_idx        on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_tsv_idx              on chunks using gin (tsv);
create index conversations_tenant_idx    on conversations(tenant_id);
create index messages_conversation_idx   on messages(conversation_id);
create index messages_tenant_idx         on messages(tenant_id);

-- =====================================================================
-- updated_at maintenance
-- =====================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_updated_at
  before update on documents
  for each row execute function set_updated_at();

create trigger conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------
-- supabase/migrations/0002_rls.sql
-- ----------------------------------------------------------------

-- 0002_rls.sql
-- Row Level Security: every row carries a tenant_id (= auth.uid()).
-- A user can only see/modify rows where tenant_id matches their auth.uid().
-- The repository layer also adds explicit `eq('tenant_id', tenantId)` —
-- belt and suspenders. See docs/SPEC.md §8.

alter table tenants       enable row level security;
alter table documents     enable row level security;
alter table chunks        enable row level security;
alter table conversations enable row level security;
alter table messages      enable row level security;

-- ---------------------------------------------------------------------
-- tenants: a user can only read/update their own tenant row. The row is
-- inserted by the on_auth_user_created trigger (security definer), so
-- normal users never need INSERT/DELETE here.
-- ---------------------------------------------------------------------
create policy "tenants_own_select" on tenants
  for select to authenticated
  using (id = auth.uid());

create policy "tenants_own_update" on tenants
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- documents / chunks / conversations / messages: full CRUD on own rows.
-- ---------------------------------------------------------------------
create policy "documents_own" on documents
  for all to authenticated
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

create policy "chunks_own" on chunks
  for all to authenticated
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

create policy "conversations_own" on conversations
  for all to authenticated
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

create policy "messages_own" on messages
  for all to authenticated
  using (tenant_id = auth.uid())
  with check (tenant_id = auth.uid());

-- ----------------------------------------------------------------
-- supabase/migrations/0003_trigger.sql
-- ----------------------------------------------------------------

-- 0003_trigger.sql
-- Auto-provision a tenants row when a new auth.users row is inserted.
-- security definer is required so this trigger can write to public.tenants
-- regardless of the calling session's RLS context (the new user has none
-- at the moment auth.users is inserted).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenants (id, name, agent_persona, agent_system_prompt)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'My Coach'),
    'A knowledgeable assistant.',
    'You are a helpful coach. Answer using only the provided context. ' ||
    'Cite sources by document title in brackets like [Doc Title]. ' ||
    'If the context does not contain what is needed, say so explicitly ' ||
    'and suggest a related topic from the knowledge base. Do not invent facts.'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------
-- supabase/migrations/0004_auto_confirm_dev.sql
-- ----------------------------------------------------------------

-- 0004_auto_confirm_dev.sql
--
-- DEMO/DEV ONLY. Auto-confirms a user's email on signup so the new account
-- can log in immediately without an SMTP round-trip. This is appropriate
-- here because:
--   (a) The two seeded demo accounts (StrengthLab, FuelRight) are created
--       via supabase.auth.admin.createUser({ email_confirm: true }) and
--       never see this trigger.
--   (b) Any reviewer or candidate signing up manually for testing should
--       not be blocked by an SMTP that isn't configured for this demo.
--
-- For production: drop this trigger and rely on real email confirmation.
--   drop trigger on_auth_user_auto_confirm on auth.users;
--   drop function public.auto_confirm_user();

create or replace function public.auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at = now();
  end if;
  return new;
end;
$$;

create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute procedure public.auto_confirm_user();

-- ----------------------------------------------------------------
-- supabase/migrations/0005_storage_bucket.sql
-- ----------------------------------------------------------------

-- 0005_storage_bucket.sql
-- Storage bucket for raw uploaded KB sources (PDFs, MD, TXT, DOCX, plus
-- materialized text from the "paste text" input). URL sources are NOT stored
-- here — they are fetched at ingest time and only the source_url is kept.
--
-- Object path convention: `<tenant_id>/<document_id>/<filename>`.
-- RLS on storage.objects enforces that a user can only touch objects under
-- their own tenant_id prefix. This is the same tenant_id used for RLS on
-- the chunks table — three layers of isolation (RLS here, RLS on chunks,
-- explicit eq() in the repository layer).

insert into storage.buckets (id, name, public)
values ('kb-uploads', 'kb-uploads', false)
on conflict (id) do nothing;

-- Drop existing policies if they exist (so the migration is re-runnable
-- during development).
drop policy if exists "kb_uploads_insert_own" on storage.objects;
drop policy if exists "kb_uploads_select_own" on storage.objects;
drop policy if exists "kb_uploads_delete_own" on storage.objects;
drop policy if exists "kb_uploads_update_own" on storage.objects;

create policy "kb_uploads_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kb-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "kb_uploads_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'kb-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "kb_uploads_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kb-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'kb-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "kb_uploads_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kb-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------------
-- supabase/migrations/0006_match_chunks.sql
-- ----------------------------------------------------------------

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

-- ----------------------------------------------------------------
-- supabase/migrations/0007_coach_categories.sql
-- ----------------------------------------------------------------

-- 0007_coach_categories.sql
-- Adds a `category` column to tenants so the landing page can group
-- coaches into "Training" / "Nutrition" / "Other" sections.
--
-- The category is set automatically by an AI classifier (see
-- src/lib/rag/classify.ts) when a coach saves their persona/system
-- prompt, or when the seed script provisions a demo coach.

alter table tenants
  add column if not exists category text not null default 'other'
    check (category in ('training', 'nutrition', 'other'));

create index if not exists tenants_category_idx on tenants(category);
