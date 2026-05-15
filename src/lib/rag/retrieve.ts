import type { SupabaseClient } from '@supabase/supabase-js';
import { embedTexts } from '@/lib/rag/embed';

// A retrieved chunk plus the metadata we'll use for citations and prompt
// composition. The names match the SQL function in migration 0006.
export type RetrievedChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  token_count: number;
  document_title: string;
  document_source_type: 'file' | 'url' | 'text';
  document_source_url: string | null;
  cosine_similarity: number;
  rrf_score: number;
};

// Below this cosine similarity, we treat the retrieval as low-confidence
// and tell the model so explicitly. The model is instructed to lean on
// "I don't have enough information…" responses instead of hallucinating.
export const LOW_CONFIDENCE_THRESHOLD = 0.3;

export type RetrievalResult = {
  chunks: RetrievedChunk[];
  lowConfidence: boolean;
  maxSimilarity: number;
};

export async function hybridSearch(
  supabase: SupabaseClient,
  tenantId: string,
  query: string,
  k = 8,
): Promise<RetrievalResult> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { chunks: [], lowConfidence: true, maxSimilarity: 0 };
  }

  const [embedding] = await embedTexts([trimmed]);

  const { data, error } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    query_text: trimmed,
    match_tenant_id: tenantId,
    match_count: k,
  });

  if (error) throw new Error(`hybridSearch: ${error.message}`);

  const chunks = (data ?? []) as RetrievedChunk[];
  const maxSimilarity = chunks.reduce(
    (max, c) => (c.cosine_similarity > max ? c.cosine_similarity : max),
    0,
  );
  return {
    chunks,
    lowConfidence: maxSimilarity < LOW_CONFIDENCE_THRESHOLD,
    maxSimilarity,
  };
}

// --------------------------------------------------------------------------
// Citation formatting. A citation is what the UI shows next to an answer —
// it must be stable, clickable for URL sources, and human-readable.
// --------------------------------------------------------------------------

export type Citation = {
  documentId: string;
  title: string;
  sourceType: 'file' | 'url' | 'text';
  sourceUrl: string | null;
  chunkIndexes: number[]; // which chunks of this document were cited
};

/**
 * Roll up retrieved chunks into per-document citations (deduped by doc).
 */
export function citationsFromChunks(chunks: RetrievedChunk[]): Citation[] {
  const byDoc = new Map<string, Citation>();
  for (const c of chunks) {
    const existing = byDoc.get(c.document_id);
    if (existing) {
      existing.chunkIndexes.push(c.chunk_index);
    } else {
      byDoc.set(c.document_id, {
        documentId: c.document_id,
        title: c.document_title,
        sourceType: c.document_source_type,
        sourceUrl: c.document_source_url,
        chunkIndexes: [c.chunk_index],
      });
    }
  }
  for (const cit of byDoc.values()) {
    cit.chunkIndexes.sort((a, b) => a - b);
  }
  return Array.from(byDoc.values());
}

/**
 * Render retrieved chunks as a single context block to splice into the
 * system prompt. Each chunk is labeled with its document title in brackets
 * so the LLM can cite by name (matches our system prompt instruction).
 */
export function formatChunksForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '(no relevant context found)';
  return chunks
    .map((c, i) => `[#${i + 1} ${c.document_title}]\n${c.content}`)
    .join('\n\n---\n\n');
}
