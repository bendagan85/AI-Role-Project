'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/app/_actions/auth';
import { AgentForm } from '@/components/admin/agent-form';
import type { Tenant } from '@/lib/repositories/tenant-repo';

/**
 * Forced-onboarding screen for an unconfigured coach (rendered by the admin
 * layout only when tenant.category === 'other', so it replaces the entire
 * admin — no nav, no children).
 *
 * Two steps:
 *  1. A compact, centered interstitial modal that ONLY explains what to do,
 *     with a "Got it" button. It's short (text + button) so it always fits
 *     the viewport and reads as a real popup.
 *  2. Dismissing it reveals just the setup form. The gate itself is still
 *     enforced server-side: only a valid training/nutrition save flips the
 *     category and unlocks the workspace — "Got it" only hides the
 *     explanation, it does not bypass anything.
 */
export function OnboardingGate({ tenant }: { tenant: Tenant }) {
  const [acknowledged, setAcknowledged] = useState(false);

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
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Set up your coach
          </h1>
          <p className="text-muted-foreground text-sm">
            Describe a training or nutrition coach, then save to unlock your
            workspace.
          </p>
        </div>
        <AgentForm tenant={tenant} />
      </main>

      {!acknowledged && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md space-y-4 rounded-xl border p-6 shadow-2xl">
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                One step before you start
              </p>
              <h2 className="text-xl font-semibold tracking-tight">
                Set up your coach to continue
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Your workspace is locked until you configure your coach. On the
                next screen, set the <strong>Persona</strong> and{' '}
                <strong>System prompt</strong> to clearly describe a{' '}
                <strong>training</strong> or <strong>nutrition</strong> coach —
                matching the assistant you want to build. We classify it on
                save: a generic or off-topic profile is rejected, and you
                won&apos;t appear in the public directory until it passes.
              </p>
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => setAcknowledged(true)}
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
