import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listDocuments } from '@/lib/repositories/document-repo';
import { DocumentsList } from '@/components/admin/documents-list';
import { DocumentUploadDialog } from '@/components/admin/document-upload-dialog';

export const revalidate = 0;

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const documents = await listDocuments(supabase, user.id);

  const counts = {
    total: documents.length,
    ready: documents.filter((d) => d.status === 'ready').length,
    processing: documents.filter((d) => d.status === 'processing').length,
    pending: documents.filter((d) => d.status === 'pending').length,
    failed: documents.filter((d) => d.status === 'failed').length,
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin"
        className="bg-muted/40 hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
      >
        ← Back to home
      </Link>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
          <p className="text-muted-foreground text-sm">
            Everything here is chunked, embedded, and used to answer your clients&apos; questions.
            Add PDFs, paste raw text, or link to URLs.
          </p>
        </div>
        <DocumentUploadDialog />
      </div>

      {/* Status summary chips — quick visual scan */}
      {documents.length > 0 && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
          <span>
            <strong className="text-foreground">{counts.total}</strong> total
          </span>
          {counts.ready > 0 && (
            <span>
              · <strong className="text-foreground">{counts.ready}</strong> ready
            </span>
          )}
          {counts.processing > 0 && (
            <span>
              · <strong className="text-foreground">{counts.processing}</strong> processing
            </span>
          )}
          {counts.pending > 0 && (
            <span>
              · <strong className="text-foreground">{counts.pending}</strong> pending
            </span>
          )}
          {counts.failed > 0 && (
            <span>
              · <strong className="text-destructive">{counts.failed}</strong> failed
            </span>
          )}
        </div>
      )}

      <DocumentsList documents={documents} />
    </div>
  );
}
