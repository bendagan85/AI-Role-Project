import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenant } from '@/lib/repositories/tenant-repo';
import { WidgetChat } from '@/components/chat/widget-chat';

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export const dynamic = 'force-dynamic';

export default async function WidgetPage({ params }: PageProps) {
  const { tenantId } = await params;

  const supabase = createAdminClient();
  const tenant = await getTenant(supabase, tenantId);
  if (!tenant) notFound();

  // Where to go "back" — to the category page if we have one, else the
  // main directory.
  const backHref =
    tenant.category === 'training' || tenant.category === 'nutrition'
      ? `/coaches/${tenant.category}`
      : '/?browse=1';
  const backLabel =
    tenant.category === 'training' || tenant.category === 'nutrition'
      ? `← Other ${tenant.category} coaches`
      : '← All coaches';

  return (
    <div className="bg-background flex h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="hover:bg-muted rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            >
              {backLabel}
            </Link>
            <div className="border-l pl-3">
              <p className="text-sm font-semibold leading-tight">{tenant.name}</p>
              <p className="text-muted-foreground text-[10px] leading-tight">
                Powered by AI Coach
              </p>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <WidgetChat
          tenantId={tenantId}
          agentName={tenant.name}
          apiEndpoint={`/api/widget/chat/${tenantId}`}
        />
      </div>
    </div>
  );
}
