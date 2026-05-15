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
