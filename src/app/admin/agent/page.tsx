import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/repositories/tenant-repo';
import { AgentForm } from '@/components/admin/agent-form';
import { COACH_CATEGORIES } from '@/lib/categories';

export const revalidate = 0;

export default async function AgentConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenant(supabase, user.id);
  if (!tenant) redirect('/login');

  const categoryMeta = COACH_CATEGORIES.find((c) => c.id === tenant.category);
  const isListed = tenant.category === 'training' || tenant.category === 'nutrition';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/admin"
        className="bg-muted/40 hover:bg-muted text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
      >
        ← Back to home
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agent configuration</h1>
        <p className="text-muted-foreground text-sm">
          Tune how your AI coach behaves. Changes apply to the next message — no redeploy required.
        </p>
      </div>

      {/* Current classification status */}
      <div
        className={
          isListed
            ? 'bg-muted/40 rounded-lg border p-4'
            : 'border-foreground/20 bg-muted/30 rounded-lg border p-4'
        }
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Directory classification
        </p>
        <p className="mt-1.5 text-sm">
          {isListed ? (
            <>
              Listed in the public directory under{' '}
              <strong>{categoryMeta?.label}</strong>. Visitors browsing{' '}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">/coaches/{tenant.category}</code>{' '}
              will see your card.
            </>
          ) : (
            <>
              <strong>Not listed publicly.</strong> Your persona or system prompt isn&apos;t
              specific enough for the AI to place you under Training or Nutrition. Mention your
              domain explicitly (e.g. &ldquo;strength coach&rdquo;, &ldquo;sports
              dietitian&rdquo;) and save — we re-classify on every save.
            </>
          )}
        </p>
      </div>

      <AgentForm tenant={tenant} />
    </div>
  );
}
