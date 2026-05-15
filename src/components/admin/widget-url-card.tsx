'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function WidgetUrlCard({ widgetUrl }: { widgetUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(widgetUrl);
      setCopied(true);
      toast.success('Widget URL copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed — select the URL manually');
    }
  }

  return (
    <section className="bg-card relative space-y-3 overflow-hidden rounded-xl border p-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Share with your clients
        </p>
        <h2 className="text-xl font-semibold tracking-tight">Your public coach widget</h2>
        <p className="text-muted-foreground text-sm">
          This is the URL you send to people who want to chat with your AI. No signup, no login —
          they just open it and start talking. The AI is grounded in the documents you upload below.
        </p>
      </div>

      <div className="bg-muted/40 flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-xs">
        <code className="flex-1 truncate">{widgetUrl}</code>
        <Button type="button" size="sm" variant="outline" onClick={copyToClipboard}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <a href={widgetUrl} target="_blank" rel="noreferrer noopener">
          <Button type="button" size="sm" variant="ghost">
            Open ↗
          </Button>
        </a>
      </div>

      <details className="group">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
          Embed on your website (one line of HTML)
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-muted-foreground text-xs">
            Paste this snippet anywhere on your site (e.g. your homepage, services page, or a
            dedicated &ldquo;Ask me&rdquo; page). The widget will appear inline:
          </p>
          <pre className="bg-muted/40 overflow-x-auto rounded-md border p-3 text-[11px]">{`<iframe
  src="${widgetUrl}"
  style="border:0;width:400px;height:600px"
  title="Chat with your AI coach"
></iframe>`}</pre>
        </div>
      </details>
    </section>
  );
}
