import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { fetchListableCoaches } from '@/lib/demo-tenants';
import { COACH_CATEGORIES, type CoachCategory } from '@/lib/categories';

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<{ browse?: string }>;
};

const VISIBLE_CATEGORIES: CoachCategory[] = ['training', 'nutrition'];

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const browseMode = params.browse === '1';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged-in coaches are normally bounced to their admin. With ?browse=1
  // they explicitly asked to view the directory as a trainee.
  if (user && !browseMode) redirect('/admin');

  const coaches = await fetchListableCoaches();
  const counts: Record<CoachCategory, number> = { training: 0, nutrition: 0, other: 0 };
  for (const c of coaches) {
    const cat = (c.tenant.category ?? 'other') as CoachCategory;
    counts[cat] += 1;
  }

  return (
    <main className="bg-background min-h-screen">
      {user && browseMode && (
        <div className="bg-muted/40 border-b">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-2 text-xs">
            <span className="text-muted-foreground">
              Viewing the public directory as a trainee. This is what your clients see.
            </span>
            <Link
              href="/admin"
              className="hover:text-foreground underline underline-offset-2"
            >
              ← Back to your admin
            </Link>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-12 text-center">
        <h1 className="text-5xl font-semibold tracking-tight md:text-6xl">AI Coach</h1>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
          Personal AI coaching, grounded in real knowledge. Pick your domain.
        </p>
      </section>

      <div className="mx-auto max-w-3xl space-y-12 px-6 pb-24">
        {/* Two category cards — the trainee entry point */}
        <section className="grid gap-4 sm:grid-cols-2">
          {VISIBLE_CATEGORIES.map((id) => {
            const cat = COACH_CATEGORIES.find((c) => c.id === id)!;
            const count = counts[id];
            return (
              <Link
                key={id}
                href={`/coaches/${id}`}
                className="bg-card hover:border-foreground/40 group flex flex-col gap-4 rounded-lg border p-8 transition-colors"
              >
                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                  {count} coach{count === 1 ? '' : 'es'}
                </p>
                <div className="space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight">{cat.label}</h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {cat.description}
                  </p>
                </div>
                <p className="text-muted-foreground group-hover:text-foreground mt-auto text-sm transition-colors">
                  Browse →
                </p>
              </Link>
            );
          })}
        </section>

        {/* Coach signup — kept small to preserve the minimalist landing */}
        <section className="border-t pt-10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">Are you a coach?</h2>
              <p className="text-muted-foreground text-sm">
                Build your own AI assistant grounded in your knowledge.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/signup"
                className={buttonVariants({ size: 'sm' })}
              >
                Sign up
              </Link>
              <Link
                href="/login"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Log in
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
