'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

type Mode = 'file' | 'url' | 'text';

type UploadResult = { ok: boolean; label: string; error?: string };

export function DocumentUploadDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('file');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [, startTransition] = useTransition();

  // file mode (multiple)
  const [files, setFiles] = useState<File[]>([]);
  const [fileTitle, setFileTitle] = useState('');

  // url mode
  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');

  // text mode
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  // ---- Counts -----------------------------------------------------------
  const hasUrl = url.trim().length > 0;
  const hasText = textTitle.trim().length > 0 && textContent.trim().length >= 20;
  const totalItems = files.length + (hasUrl ? 1 : 0) + (hasText ? 1 : 0);

  function reset() {
    setFiles([]);
    setFileTitle('');
    setUrl('');
    setUrlTitle('');
    setTextTitle('');
    setTextContent('');
    setProgress(null);
    setMode('file');
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---- Individual uploaders --------------------------------------------
  async function uploadFile(file: File, title?: string): Promise<UploadResult> {
    const form = new FormData();
    form.set('file', file);
    if (title && title.trim()) form.set('title', title.trim());
    const res = await fetch('/api/admin/ingest', { method: 'POST', body: form });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, label: file.name, error: body.error ?? `Failed (${res.status})` };
    }
    return { ok: true, label: file.name };
  }

  async function uploadUrl(): Promise<UploadResult> {
    const res = await fetch('/api/admin/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_type: 'url',
        url: url.trim(),
        title: urlTitle.trim() || undefined,
      }),
    });
    const label = urlTitle.trim() || url.trim();
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, label, error: body.error ?? `Failed (${res.status})` };
    }
    return { ok: true, label };
  }

  async function uploadText(): Promise<UploadResult> {
    const res = await fetch('/api/admin/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source_type: 'text',
        title: textTitle.trim(),
        content: textContent,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        label: textTitle.trim(),
        error: body.error ?? `Failed (${res.status})`,
      };
    }
    return { ok: true, label: textTitle.trim() };
  }

  // ---- Submit-all -------------------------------------------------------
  async function onSubmit() {
    if (totalItems === 0) {
      toast.error('Add at least one file, URL, or text item');
      return;
    }

    setSubmitting(true);
    setProgress({ done: 0, total: totalItems });
    const errors: UploadResult[] = [];
    let done = 0;

    try {
      // Files first (typically biggest), then URL, then text.
      const customFileTitle = files.length === 1 ? fileTitle : undefined;
      for (const file of files) {
        const r = await uploadFile(file, customFileTitle);
        if (!r.ok) errors.push(r);
        done += 1;
        setProgress({ done, total: totalItems });
      }
      if (hasUrl) {
        const r = await uploadUrl();
        if (!r.ok) errors.push(r);
        done += 1;
        setProgress({ done, total: totalItems });
      }
      if (hasText) {
        const r = await uploadText();
        if (!r.ok) errors.push(r);
        done += 1;
        setProgress({ done, total: totalItems });
      }

      const succeeded = totalItems - errors.length;
      if (errors.length === 0) {
        toast.success(
          totalItems === 1
            ? 'Document added — status: pending'
            : `${totalItems} documents added — status: pending`,
        );
        reset();
        setOpen(false);
      } else {
        toast.error(
          `${errors.length} of ${totalItems} failed. ${errors[0].label}: ${errors[0].error}`,
        );
        if (succeeded > 0) {
          toast.success(`${succeeded} added`);
        }
      }
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  // ---- Render ----------------------------------------------------------
  const buttonLabel = (() => {
    if (progress) return `Uploading ${progress.done}/${progress.total}…`;
    if (submitting) return 'Adding…';
    if (totalItems === 0) return 'Add document';
    if (totalItems === 1) return 'Add 1 document';
    return `Add ${totalItems} documents`;
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={(props) => (
          <Button {...props} type="button">
            Add document
          </Button>
        )}
      />
      <DialogContent className="sm:max-w-lg max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>
            Fill in any combination of the three tabs and click submit — each filled tab
            creates one or more documents. Ingestion runs in the background; only training
            and nutrition material is accepted.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => setMode(v as Mode)}
          className="-mx-1 min-h-0 overflow-y-auto px-1"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="file">
              File{files.length > 0 && <span className="ml-1 text-xs">· {files.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="url">
              URL{hasUrl && <span className="ml-1 text-xs">· 1</span>}
            </TabsTrigger>
            <TabsTrigger value="text">
              Text{hasText && <span className="ml-1 text-xs">· 1</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3 pt-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Files (PDF, MD, TXT, DOCX — up to 25MB each)
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.md,.txt,.docx,application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const list = e.target.files;
                  setFiles(list ? Array.from(list) : []);
                  setFileTitle('');
                }}
                className="border-input bg-background file:bg-muted block w-full rounded-md border px-3 py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:px-2 file:py-1 file:text-xs"
              />
              <p className="text-muted-foreground text-xs">
                Hold Ctrl/Cmd or Shift to pick multiple at once.
              </p>
            </div>

            {files.length > 1 && (
              <div className="bg-muted/40 space-y-1 rounded-md border p-2">
                <p className="text-xs font-medium">
                  {files.length} files selected · each will become a separate document
                </p>
                <ul className="space-y-0.5 text-xs">
                  {files.map((f, idx) => (
                    <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="text-destructive hover:underline"
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {files.length === 1 && (
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Title (optional — defaults to filename)
                </label>
                <Input
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  placeholder={files[0].name}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="url" className="space-y-3 pt-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">URL</label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Title (optional — defaults to URL)</label>
              <Input
                value={urlTitle}
                onChange={(e) => setUrlTitle(e.target.value)}
                placeholder="e.g. RPE Explained"
              />
            </div>
          </TabsContent>

          <TabsContent value="text" className="space-y-3 pt-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="e.g. Quick reference: 5/3/1 percentages"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste the content here…"
                rows={8}
                className="max-h-[40dvh] overflow-y-auto"
              />
              <p className="text-muted-foreground text-xs">
                {textContent.length.toLocaleString()} chars (min 20)
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting || totalItems === 0}>
            {buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
