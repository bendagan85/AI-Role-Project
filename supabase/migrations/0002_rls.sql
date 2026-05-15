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
