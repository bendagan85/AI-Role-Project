import { NextResponse, type NextRequest } from 'next/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTenant } from '@/lib/repositories/tenant-repo';
import { hybridSearch, citationsFromChunks } from '@/lib/rag/retrieve';
import { composeSystemPrompt } from '@/lib/rag/prompts';

// Public, unauthenticated chat endpoint for the embeddable widget.
// Tenant is taken from the URL — the widget URL is shared by the coach with
// their end-users (trainees). Conversations are NOT persisted here (keeps
// the widget self-contained and avoids leaking trainee data into the coach's
// admin view). The coach can still chat with their own agent via /app to
// generate persisted conversations.

export const runtime = 'nodejs';

function modelFor(name: string) {
  if (name.startsWith('claude')) return anthropic(name);
  if (name.startsWith('gpt')) return openai(name);
  return anthropic('claude-sonnet-4-6');
}

function extractLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const text = (m.parts ?? [])
      .map((p) => (p.type === 'text' ? p.text : ''))
      .filter(Boolean)
      .join(' ')
      .trim();
    if (text.length > 0) return text;
  }
  return '';
}

// Naive in-memory rate limit. Resets on deploy. Adequate for the demo,
// production would use a real KV / Redis / Postgres token bucket.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20; // 20 messages per tenant per minute
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantId: string }> },
): Promise<Response> {
  const { tenantId } = await context.params;

  if (!checkRateLimit(tenantId)) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429 },
    );
  }

  let body: { messages: UIMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
  }

  // Admin client because the widget caller has no auth session.
  // Security: tenantId comes from the URL (which is public by design — the
  // coach distributes it). The retrieval and prompt composition only touch
  // this tenant's data; nothing else is exposed.
  const supabase = createAdminClient();

  const tenant = await getTenant(supabase, tenantId);
  if (!tenant) {
    return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
  }

  const userText = extractLatestUserText(body.messages);
  if (userText.length === 0) {
    return NextResponse.json({ error: 'Empty message' }, { status: 400 });
  }

  const { chunks, lowConfidence } = await hybridSearch(
    supabase,
    tenantId,
    userText,
    tenant.retrieval_k,
  );
  const citations = citationsFromChunks(chunks);

  const system = composeSystemPrompt({
    tenant,
    chunks,
    lowConfidence,
    userProfile: null,
  });

  const modelMessages = await convertToModelMessages(body.messages);
  const result = streamText({
    model: modelFor(tenant.llm_model),
    system,
    messages: modelMessages,
    temperature: tenant.temperature,
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { citations, lowConfidence };
      }
      return undefined;
    },
  });
}
