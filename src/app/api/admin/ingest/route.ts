import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import {
  createDocument,
  deleteDocument,
  updateDocumentStatus,
  storagePath,
  type Document,
  type DocumentSourceType,
} from '@/lib/repositories/document-repo';

// File uploads (up to 25MB) + storage write can be slow; give the handler
// a real budget rather than the short serverless default.
export const runtime = 'nodejs';
export const maxDuration = 60;

async function dispatchIngestion(
  supabase: SupabaseClient,
  doc: Document,
): Promise<void> {
  try {
    await inngest.send({
      name: 'document.ingest',
      data: { tenantId: doc.tenant_id, documentId: doc.id },
    });
  } catch (err) {
    // The row exists and can be re-triggered, but don't leave it stuck at
    // 'pending' with no explanation — surface it as failed so the coach
    // sees a reason and the Re-ingest button appears.
    console.error('[ingest] inngest.send failed:', err);
    await updateDocumentStatus(supabase, doc.tenant_id, doc.id, {
      status: 'failed',
      error_message:
        'Could not queue ingestion — the background job service was ' +
        'unreachable. Click Re-ingest to retry.',
    }).catch(() => {});
  }
}

// Max upload size enforced at the route level. Supabase Storage free tier
// allows 50MB per file, but very large PDFs are slow to ingest and likely
// indicate a bad source. We cap at 25MB for now.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const urlSchema = z.object({
  source_type: z.literal('url'),
  url: z.url('Enter a valid URL'),
  title: z.string().min(1).max(200).optional(),
});

const textSchema = z.object({
  source_type: z.literal('text'),
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(20, 'Paste at least 20 characters').max(500_000),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const tenantId = user.id;

  const contentType = request.headers.get('content-type') ?? '';

  // --------------------------------------------------------------------
  // File upload (multipart/form-data)
  // --------------------------------------------------------------------
  if (contentType.startsWith('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing "file" field' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${MAX_FILE_BYTES / (1024 * 1024)}MB.` },
        { status: 413 },
      );
    }

    const titleOverride = form.get('title');
    const title =
      typeof titleOverride === 'string' && titleOverride.trim().length > 0
        ? titleOverride.trim()
        : file.name;

    let doc;
    try {
      doc = await createDocument(supabase, tenantId, {
        title,
        source_type: 'file' as DocumentSourceType,
        original_filename: file.name,
        mime_type: file.type || 'application/octet-stream',
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to create document row' },
        { status: 500 },
      );
    }

    const path = storagePath(tenantId, doc.id, file.name);
    const { error: storageError } = await supabase.storage
      .from('kb-uploads')
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (storageError) {
      // Roll back the document row to keep things consistent.
      await deleteDocument(supabase, tenantId, doc.id).catch(() => {});
      return NextResponse.json(
        { error: `Storage upload failed: ${storageError.message}` },
        { status: 500 },
      );
    }

    await dispatchIngestion(supabase, doc);
    return NextResponse.json({ document: doc }, { status: 201 });
  }

  // --------------------------------------------------------------------
  // URL or text (application/json)
  // --------------------------------------------------------------------
  if (contentType.startsWith('application/json')) {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const sourceType = (raw as { source_type?: string }).source_type;

    if (sourceType === 'url') {
      const parsed = urlSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        );
      }
      try {
        const doc = await createDocument(supabase, tenantId, {
          title: parsed.data.title ?? parsed.data.url,
          source_type: 'url',
          source_url: parsed.data.url,
        });
        await dispatchIngestion(supabase, doc);
        return NextResponse.json({ document: doc }, { status: 201 });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed' },
          { status: 500 },
        );
      }
    }

    if (sourceType === 'text') {
      const parsed = textSchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 },
        );
      }
      let doc;
      try {
        doc = await createDocument(supabase, tenantId, {
          title: parsed.data.title,
          source_type: 'text',
          original_filename: 'content.txt',
          mime_type: 'text/plain',
        });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed' },
          { status: 500 },
        );
      }
      const path = storagePath(tenantId, doc.id, 'content.txt');
      const { error: storageError } = await supabase.storage
        .from('kb-uploads')
        .upload(path, new Blob([parsed.data.content], { type: 'text/plain' }), {
          contentType: 'text/plain',
          upsert: false,
        });
      if (storageError) {
        await deleteDocument(supabase, tenantId, doc.id).catch(() => {});
        return NextResponse.json(
          { error: `Storage upload failed: ${storageError.message}` },
          { status: 500 },
        );
      }
      await dispatchIngestion(supabase, doc);
      return NextResponse.json({ document: doc }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unknown source_type' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Unsupported content-type' }, { status: 415 });
}
