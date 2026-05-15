import Link from 'next/link';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/repositories/tenant-repo';
import { listDocuments } from '@/lib/repositories/document-repo';
import { WidgetUrlCard } from '@/components/admin/widget-url-card';

export const dynamic = 'force-dynamic';

async function resolveOrigin(): Promise<string> {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (envOrigin) return envOrigin;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [tenant, documents, origin] = await Promise.all([
    getTenant(supabase, user.id),
    listDocuments(supabase, user.id),
    resolveOrigin(),
  ]);

  const readyDocs = documents.filter((d) => d.status === 'ready').length;
  const processingDocs = documents.filter((d) => d.status === 'processing').length;
  const failedDocs = documents.filter((d) => d.status === 'failed').length;
  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0);
  const widgetUrl = `${origin}/widget/${user.id}`;
  const isFirstRun = documents.length === 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {tenant?.name ?? 'Your workspace'}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {tenant?.agent_persona ?? 'Set up your AI coach below.'}
        </p>
      </div>

      {/* First-run banner: only when there are no docs */}
      {isFirstRun && (
        <div className="bg-muted/40 rounded-lg border p-4">
          <p className="text-sm font-medium">Welcome — let&apos;s get you set up.</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Your AI is ready, but it has no knowledge yet. Upload at least one document so it can
            answer questions grounded in your content.
          </p>
        </div>
      )}

      {/* Widget URL — the most important thing on this page */}
      <WidgetUrlCard widgetUrl={widgetUrl} />

      {/* Stats — with context, not just numbers */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="bg-card space-y-1 rounded-lg border p-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Knowledge base</p>
          <p className="text-3xl font-semibold tabular-nums">{documents.length}</p>
          <p className="text-muted-foreground text-xs">
            {readyDocs > 0 && `${readyDocs} ready`}
            {processingDocs > 0 && ` · ${processingDocs} processing`}
            {failedDocs > 0 && (
              <span className="text-destructive"> · {failedDocs} failed</span>
            )}
            {documents.length === 0 && 'No documents yet'}
            {documents.length > 0 && ` · ${totalChunks} chunks indexed`}
          </p>
        </div>

        <div className="bg-card space-y-1 rounded-lg border p-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Persona</p>
          <p className="line-clamp-2 text-sm font-medium">
            {tenant?.agent_persona ?? 'Not configured'}
          </p>
          <p className="text-muted-foreground text-xs">
            Shapes how your AI introduces itself
          </p>
        </div>

        <div className="bg-card space-y-1 rounded-lg border p-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Model</p>
          <p className="font-mono text-sm">{tenant?.llm_model ?? '—'}</p>
          <p className="text-muted-foreground text-xs">
            Temperature {tenant?.temperature ?? '—'} · retrieves k={tenant?.retrieval_k ?? '—'}{' '}
            chunks per query
          </p>
        </div>
      </section>

      {/* Quick actions */}
      <section className="space-y-3">
        <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Quick actions
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/admin/documents"
            className="group bg-card hover:border-foreground/30 flex flex-col gap-2 rounded-lg border p-5 transition-colors"
          >
            <p className="text-base font-medium">Manage knowledge</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Upload PDFs, paste text, or link URLs. Index runs automatically.
            </p>
            <span className="text-muted-foreground group-hover:text-foreground mt-auto pt-2 text-xs transition-colors">
              {documents.length === 0
                ? 'Add your first document →'
                : `${documents.length} document${documents.length === 1 ? '' : 's'} →`}
            </span>
          </Link>

          <Link
            href="/admin/agent"
            className="group bg-card hover:border-foreground/30 flex flex-col gap-2 rounded-lg border p-5 transition-colors"
          >
            <p className="text-base font-medium">Tune the agent</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Persona, system prompt, model, temperature, retrieval depth.
            </p>
            <span className="text-muted-foreground group-hover:text-foreground mt-auto pt-2 text-xs transition-colors">
              Configure →
            </span>
          </Link>

          <Link
            href="/app"
            className="group bg-card hover:border-foreground/30 flex flex-col gap-2 rounded-lg border p-5 transition-colors"
          >
            <p className="text-base font-medium">Test as yourself</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              A private scratchpad to sanity-check tone and grounding before you share the widget.
              Sessions are ephemeral — nothing is saved, and each visit starts fresh.
            </p>
            <span className="text-muted-foreground group-hover:text-foreground mt-auto pt-2 text-xs transition-colors">
              Open test chat →
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
