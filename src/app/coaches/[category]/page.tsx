import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchListableCoaches } from '@/lib/demo-tenants';
import { COACH_CATEGORIES, type CoachCategory } from '@/lib/categories';

export const dynamic = 'force-dynamic';

const VISIBLE_CATEGORIES: CoachCategory[] = ['training', 'nutrition'];

type PageProps = {
  params: Promise<{ category: string }>;
};

export default async function CategoryCoachesPage({ params }: PageProps) {
  const { category } = await params;
  if (!VISIBLE_CATEGORIES.includes(category as CoachCategory)) {
    notFound();
  }
  const cat = COACH_CATEGORIES.find((c) => c.id === category)!;

  const allCoaches = await fetchListableCoaches();
  const coaches = allCoaches.filter((c) => c.tenant.category === category);

  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl space-y-12 px-6 py-12">
        <Link
          href="/?browse=1"
          className="hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
        >
          ← All categories
        </Link>

        <header className="space-y-2">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Category
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">{cat.label}</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">{cat.description}</p>
        </header>

        {coaches.length === 0 ? (
          <div className="bg-muted/30 rounded-lg border border-dashed py-16 px-6 text-center">
            <p className="text-foreground text-base font-medium">
              No {cat.label.toLowerCase()} coaches yet
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              The first coach in this category will appear here once they sign up and upload their
              knowledge base.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {coaches.map((c) => (
              <Link
                key={c.tenantId}
                href={`/widget/${c.tenantId}`}
                className="bg-card hover:border-foreground/40 group flex flex-col gap-3 rounded-lg border p-6 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{c.tenant.name}</h2>
                  <span className="text-muted-foreground group-hover:text-foreground rounded-md border px-2 py-0.5 text-xs transition-colors">
                    Chat →
                  </span>
                </div>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {c.tenant.agent_persona}
                </p>
                <div className="text-muted-foreground mt-auto flex items-center gap-3 pt-2 text-[11px]">
                  <span className="bg-muted/60 rounded-full px-2 py-0.5">
                    {c.docCount} document{c.docCount === 1 ? '' : 's'}
                  </span>
                  <span className="font-mono">
                    {c.tenant.llm_model.replace('claude-sonnet-', 'Claude ')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
