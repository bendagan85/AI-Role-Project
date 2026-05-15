'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Document, DocumentStatus } from '@/lib/repositories/document-repo';

const statusVariant: Record<DocumentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  processing: 'outline',
  ready: 'default',
  failed: 'destructive',
};

// Fixed locale so server and client render the same string (no hydration mismatch).
const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

function sourceLabel(doc: Document): string {
  if (doc.source_type === 'url') return doc.source_url ?? 'URL';
  if (doc.source_type === 'file') return doc.original_filename ?? 'File';
  return 'Pasted text';
}

export function DocumentsList({ documents }: { documents: Document[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reingestingId, setReingestingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleReingest(id: string) {
    setReingestingId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}/reingest`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? 'Re-ingest failed');
        return;
      }
      toast.success('Re-queued for ingestion');
      startTransition(() => router.refresh());
    } finally {
      setReingestingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="bg-muted/20 rounded-lg border border-dashed py-16 px-6 text-center">
        <p className="text-foreground text-base font-medium">Start with one document</p>
        <p className="text-muted-foreground mx-auto mt-2 max-w-sm text-sm leading-relaxed">
          Drop a PDF, paste a coaching note, or link your blog. Your AI won&apos;t answer real
          questions until it has something to ground its answers in.
        </p>
        <p className="text-muted-foreground mt-4 text-xs">
          Use the <strong className="text-foreground">Add document</strong> button at the top
          right.
        </p>
      </div>
    );
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This removes the file and all of its chunks.`)) return;
    setPendingId(id);
    try {
      const res = await fetch(`/api/admin/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? 'Delete failed');
        return;
      }
      toast.success('Deleted');
      startTransition(() => router.refresh());
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Chunks</TableHead>
            <TableHead>Added</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.title}</TableCell>
              <TableCell className="text-muted-foreground max-w-xs truncate text-xs">
                {sourceLabel(doc)}
              </TableCell>
              <TableCell className="text-xs">
                <code>{doc.source_type}</code>
              </TableCell>
              <TableCell>
                <Badge variant={statusVariant[doc.status]}>{doc.status}</Badge>
                {doc.error_message && (
                  <span className="text-destructive ml-2 text-xs">{doc.error_message}</span>
                )}
              </TableCell>
              <TableCell>{doc.chunk_count}</TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {formatDate(doc.created_at)}
              </TableCell>
              <TableCell className="space-x-1 whitespace-nowrap">
                {(doc.status === 'pending' || doc.status === 'failed') && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reingestingId === doc.id}
                    onClick={() => handleReingest(doc.id)}
                  >
                    {reingestingId === doc.id ? '…' : 'Re-ingest'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pendingId === doc.id}
                  onClick={() => handleDelete(doc.id, doc.title)}
                >
                  {pendingId === doc.id ? 'Deleting…' : 'Delete'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
