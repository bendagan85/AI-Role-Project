import { Inngest } from 'inngest';

// In dev (and CI), force the Inngest SDK into "dev mode" so it talks to the
// local Inngest dev server and skips signature validation. In production
// (NODE_ENV=production on Vercel), the SDK will pick up the real signing key
// from INNGEST_SIGNING_KEY and verify signatures normally.
const isDev = process.env.NODE_ENV !== 'production';

export const inngest = new Inngest({
  id: 'ai-coach',
  isDev,
});

export type DocumentIngestEvent = {
  name: 'document.ingest';
  data: {
    tenantId: string;
    documentId: string;
  };
};
