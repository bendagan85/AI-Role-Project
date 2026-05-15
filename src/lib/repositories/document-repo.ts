import type { SupabaseClient } from '@supabase/supabase-js';

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type DocumentSourceType = 'file' | 'url' | 'text';

export type Document = {
  id: string;
  tenant_id: string;
  title: string;
  source_type: DocumentSourceType;
  source_url: string | null;
  original_filename: string | null;
  mime_type: string | null;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

export type NewDocument = Pick<Document, 'title' | 'source_type'> &
  Partial<Pick<Document, 'source_url' | 'original_filename' | 'mime_type'>>;

export async function listDocuments(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listDocuments: ${error.message}`);
  return (data ?? []) as Document[];
}

export async function getDocument(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<Document | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getDocument: ${error.message}`);
  return data as Document | null;
}

export async function createDocument(
  supabase: SupabaseClient,
  tenantId: string,
  doc: NewDocument,
): Promise<Document> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      tenant_id: tenantId,
      title: doc.title,
      source_type: doc.source_type,
      source_url: doc.source_url ?? null,
      original_filename: doc.original_filename ?? null,
      mime_type: doc.mime_type ?? null,
      status: 'pending',
    })
    .select()
    .single();
  if (error) throw new Error(`createDocument: ${error.message}`);
  return data as Document;
}

export async function deleteDocument(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('id', id);
  if (error) throw new Error(`deleteDocument: ${error.message}`);
}

export async function updateDocumentStatus(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: Partial<Pick<Document, 'status' | 'error_message' | 'chunk_count'>>,
): Promise<void> {
  const { error } = await supabase
    .from('documents')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id);
  if (error) throw new Error(`updateDocumentStatus: ${error.message}`);
}

export function storagePath(tenantId: string, docId: string, filename: string): string {
  return `${tenantId}/${docId}/${filename}`;
}
