import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/_actions/auth';
import { getTenant } from '@/lib/repositories/tenant-repo';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenant(supabase, user.id);
  if (!tenant) redirect('/login');
  // Coaches who haven't completed the onboarding gate (persona still
  // classifies as 'other') can't use the test chat either — send them
  // back to /admin, which renders the forced setup form.
  if (tenant.category === 'other') redirect('/admin');

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              AI Coach
            </Link>
            <div className="flex items-center gap-2">
              <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                Test chat
              </span>
              <span className="text-muted-foreground text-xs">
                Logged in as the coach — used for testing
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="hover:bg-muted rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              ← Back to admin
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
