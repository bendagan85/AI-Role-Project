import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/_actions/auth';
import { getTenant } from '@/lib/repositories/tenant-repo';
import { OnboardingGate } from '@/components/admin/onboarding-gate';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenant(supabase, user.id);
  if (!tenant) redirect('/login');

  // Forced onboarding gate. A freshly signed-up coach starts with the
  // default persona (category 'other'). Until it classifies as training
  // or nutrition, replace the ENTIRE admin (no nav, no children) with the
  // onboarding screen: an explanatory popup, then the setup form. The
  // gate is enforced here server-side — only a valid save flips the
  // category. Demo coaches (Marcus/Nina) are seeded classified and skip
  // this entirely.
  if (tenant.category === 'other') {
    return <OnboardingGate tenant={tenant} />;
  }

  return (
    <div className="bg-background min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              AI Coach
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/admin"
                className="hover:bg-muted rounded-md px-3 py-1.5 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/admin/documents"
                className="text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5 transition-colors"
              >
                Documents
              </Link>
              <Link
                href="/admin/agent"
                className="text-muted-foreground hover:bg-muted rounded-md px-3 py-1.5 transition-colors"
              >
                Agent
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs">
              {tenant?.name ?? user.email}
            </span>
            <Link
              href="/?browse=1"
              className="hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
              title="See the public directory the way your clients see it"
            >
              Browse coaches ↗
            </Link>
            <Link
              href="/app"
              className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
              title="Chat as yourself — used for testing the agent"
            >
              Test chat ↗
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
