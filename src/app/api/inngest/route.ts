import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { processDocument } from '@/lib/inngest/functions/process-document';

// Ingestion (URL fetch + JSDOM/Readability + chunk + embed) routinely
// exceeds the default serverless budget on Vercel. Force the Node.js
// runtime (jsdom/pdf-parse cannot run on Edge) and a generous timeout.
export const runtime = 'nodejs';
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processDocument],
});
