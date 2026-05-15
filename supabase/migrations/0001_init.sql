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
