import { NonRetriableError } from 'inngest';
import { inngest } from '@/lib/inngest/client';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getDocument,
  updateDocumentStatus,
  storagePath,
} from '@/lib/repositories/document-repo';
import {
  deleteChunksForDocument,
  insertChunks,
  type NewChunk,
} from '@/lib/repositories/chunks-repo';
import { chunkText } from '@/lib/rag/chunk';
import { embedTexts } from '@/lib/rag/embed';
import { extractDocx, extractPdf, extractUrl, pickExtractor } from '@/lib/rag/extract';

export const processDocument = inngest.createFunction(
  {
    id: 'process-document',
    name: 'Ingest a document into the KB',
    triggers: [{ event: 'document.ingest' }],
    retries: 2,
    concurrency: { limit: 3 },
  },
  async ({ event, step, logger }) => {
    const { tenantId, documentId } = event.data as {
      tenantId: string;
      documentId: string;
    };
    const supabase = createAdminClient();

    // -------------------------------------------------------------------
    // Step 0: mark as processing so the UI can react.
    // -------------------------------------------------------------------
    await step.run('mark-processing', async () => {
      await updateDocumentStatus(supabase, tenantId, documentId, {
        status: 'processing',
        error_message: null,
        chunk_count: 0,
      });
    });

    try {
      // -----------------------------------------------------------------
      // Step 1: load the document row and resolve the raw text.
      // -----------------------------------------------------------------
      const rawText = await step.run('load-and-extract', async () => {
        const doc = await getDocument(supabase, tenantId, documentId);
        if (!doc) {
          throw new NonRetriableError(`Document ${documentId} not found`);
        }

        if (doc.source_type === 'url') {
          if (!doc.source_url) throw new NonRetriableError('URL doc has no source_url');
          const extracted = await extractUrl(doc.source_url);
          return extracted.text;
        }

        // file or text: read from Storage
        const filename =
          doc.source_type === 'text' ? 'content.txt' : (doc.original_filename ?? 'file');
        const path = storagePath(tenantId, doc.id, filename);
        const { data: blob, error } = await supabase.storage
          .from('kb-uploads')
          .download(path);
        if (error || !blob) {
          throw new NonRetriableError(
            `Storage download failed: ${error?.message ?? 'no body'}`,
          );
        }
        const buf = await blob.arrayBuffer();

        if (doc.source_type === 'text') {
          return new TextDecoder('utf-8').decode(buf);
        }

        const kind = pickExtractor(filename, doc.mime_type);
        if (kind === 'pdf') return await extractPdf(buf);
        if (kind === 'docx') return await extractDocx(buf);
        return new TextDecoder('utf-8').decode(buf);
      });

      if (!rawText || rawText.trim().length < 20) {
        throw new NonRetriableError('Extracted text is empty or too short');
      }

      // -----------------------------------------------------------------
      // Step 2: chunk + embed (this is the work-heavy step).
      // -----------------------------------------------------------------
      const { chunks, embeddings } = await step.run('chunk-and-embed', async () => {
        const pieces = chunkText(rawText);
        if (pieces.length === 0) throw new NonRetriableError('Chunking produced no chunks');
        logger.info(`Chunked into ${pieces.length} pieces`);
        const vectors = await embedTexts(pieces.map((p) => p.content));
        if (vectors.length !== pieces.length) {
          throw new Error(
            `Embedding count (${vectors.length}) != chunk count (${pieces.length})`,
          );
        }
        return { chunks: pieces, embeddings: vectors };
      });

      // -----------------------------------------------------------------
      // Step 3: idempotent upsert — delete old chunks, insert new.
      // -----------------------------------------------------------------
      await step.run('delete-old-chunks', async () => {
        await deleteChunksForDocument(supabase, tenantId, documentId);
      });

      await step.run('insert-chunks', async () => {
        const newChunks: NewChunk[] = chunks.map((c, i) => ({
          document_id: documentId,
          chunk_index: i,
          content: c.content,
          metadata: {},
          embedding: embeddings[i],
          token_count: c.approxTokenCount,
        }));
        await insertChunks(supabase, tenantId, newChunks);
      });

      // -----------------------------------------------------------------
      // Step 4: mark ready.
      // -----------------------------------------------------------------
      await step.run('mark-ready', async () => {
        await updateDocumentStatus(supabase, tenantId, documentId, {
          status: 'ready',
          error_message: null,
          chunk_count: chunks.length,
        });
      });

      return { chunks: chunks.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Ingestion failed: ${message}`);
      await updateDocumentStatus(supabase, tenantId, documentId, {
        status: 'failed',
        error_message: message.slice(0, 500),
      });
      // Re-throw NonRetriableError so Inngest doesn't retry hopeless cases.
      if (err instanceof NonRetriableError) throw err;
      throw err;
    }
  },
);
