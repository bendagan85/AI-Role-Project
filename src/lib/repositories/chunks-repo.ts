import type { SupabaseClient } from '@supabase/supabase-js';

export type Chunk = {
  id: string;
  tenant_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  token_count: number;
};

export type NewChunk = {
  document_id: string;
  chunk_index: number;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
  token_count: number;
};

export async function deleteChunksForDocument(
  supabase: SupabaseClient,
  tenantId: string,
  documentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('chunks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('document_id', documentId);
  if (error) throw new Error(`deleteChunksForDocument: ${error.message}`);
}

export async function insertChunks(
  supabase: SupabaseClient,
  tenantId: string,
  chunks: NewChunk[],
): Promise<void> {
  if (chunks.length === 0) return;
  // Insert in batches to avoid blowing up the request body.
  const BATCH = 200;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH).map((c) => ({
      tenant_id: tenantId,
      document_id: c.document_id,
      chunk_index: c.chunk_index,
      content: c.content,
      metadata: c.metadata ?? {},
      embedding: c.embedding,
      token_count: c.token_count,
    }));
    const { error } = await supabase.from('chunks').insert(slice);
    if (error) throw new Error(`insertChunks: ${error.message}`);
  }
}

export async function countChunks(
  supabase: SupabaseClient,
  tenantId: string,
  documentId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('document_id', documentId);
  if (error) throw new Error(`countChunks: ${error.message}`);
  return count ?? 0;
}
