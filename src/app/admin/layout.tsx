import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/_actions/auth';
import { getTenant } from '@/lib/repositories/tenant-repo';
import { AgentForm } from '@/components/admin/agent-form';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenant(supabase, user.id);
  if (!tenant) redirect('/login');

  // ------------------------------------------------------------------
  // Forced onboarding gate. A freshly signed-up coach starts with the
  // default persona, which classifies as 'other' — they would not appear
  // in the public directory and might not realise they must configure
  // anything. Until the persona/system-prompt classifies as training or
  // nutrition, replace the ENTIRE admin (no nav, no children) with the
  // setup form. Saving runs updateAgentConfig, which already refuses an
  // off-domain persona, so the only way out is a valid coach profile.
  // Demo coaches (Marcus/Nina) are seeded classified, so they skip this.
  // ------------------------------------------------------------------
  if (tenant.category === 'other') {
    return (
      <div className="bg-background min-h-screen">
        <header className="border-b">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
            <span className="text-lg font-semibold tracking-tight">AI Coach</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Finish setting up your coach
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Before you can manage knowledge or share your widget, describe who
              your AI coach is. Your persona and system prompt must clearly
              describe a <strong>training</strong> or <strong>nutrition</strong>{' '}
              coach — that&apos;s how clients find you in the public directory.
              You can refine everything later.
            </p>
          </div>
          <AgentForm tenant={tenant} />
        </main>
      </div>
    );
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
