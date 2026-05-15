import { NextResponse, type NextRequest } from 'next/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/repositories/tenant-repo';
import {
  createConversation,
  getConversation,
  touchConversation,
} from '@/lib/repositories/conversation-repo';
import { insertMessage } from '@/lib/repositories/message-repo';
import { hybridSearch, citationsFromChunks } from '@/lib/rag/retrieve';
import { composeSystemPrompt } from '@/lib/rag/prompts';

// Node.js runtime — pdf-parse and the supabase-js client we use are not
// edge-compatible. We can revisit Edge once everything is pure.
export const runtime = 'nodejs';

function modelFor(name: string) {
  if (name.startsWith('claude')) return anthropic(name);
  if (name.startsWith('gpt')) return openai(name);
  // Fallback so we don't 500 on an unknown name — log loudly.
  console.warn(`[chat] unknown model "${name}", falling back to claude-sonnet-4-6`);
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

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const tenantId = user.id;

  let body: {
    messages: UIMessage[];
    conversationId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
  }

  // ---------------------------------------------------------------------
  // Load tenant config (persona, prompt, model, temp, k).
  // ---------------------------------------------------------------------
  const tenant = await getTenant(supabase, tenantId);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 500 });
  }

  // ---------------------------------------------------------------------
  // Resolve / create the conversation. Persist the latest user message
  // BEFORE streaming so a disconnected stream still leaves a clean record.
  // ---------------------------------------------------------------------
  let conversation = body.conversationId
    ? await getConversation(supabase, tenantId, body.conversationId)
    : null;
  if (!conversation) {
    const userText = extractLatestUserText(body.messages);
    const title = userText ? userText.slice(0, 80) : 'New conversation';
    conversation = await createConversation(supabase, tenantId, title);
  }
  const conversationId = conversation.id;

  const userText = extractLatestUserText(body.messages);
  if (userText.length === 0) {
    return NextResponse.json({ error: 'Empty user message' }, { status: 400 });
  }
  await insertMessage(supabase, tenantId, conversationId, 'user', userText, []);

  // ---------------------------------------------------------------------
  // Retrieve top-k relevant chunks for this user message.
  // ---------------------------------------------------------------------
  const { chunks, lowConfidence } = await hybridSearch(
    supabase,
    tenantId,
    userText,
    tenant.retrieval_k,
  );
  const citations = citationsFromChunks(chunks);

  // ---------------------------------------------------------------------
  // Compose system prompt and stream the LLM response.
  // ---------------------------------------------------------------------
  const system = composeSystemPrompt({
    tenant,
    chunks,
    lowConfidence,
    userProfile: conversation.user_profile,
  });

  const modelMessages = await convertToModelMessages(body.messages);
  const result = streamText({
    model: modelFor(tenant.llm_model),
    system,
    messages: modelMessages,
    temperature: tenant.temperature,
    onFinish: async ({ text }) => {
      try {
        await insertMessage(
          supabase,
          tenantId,
          conversationId,
          'assistant',
          text,
          citations,
        );
        await touchConversation(supabase, tenantId, conversationId);
      } catch (err) {
        console.error('[chat] onFinish persistence failed:', err);
      }
    },
  });

  // Attach the conversation id + citations as message metadata so the
  // client can pick them up without a separate roundtrip.
  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return {
          conversationId,
          citations,
          lowConfidence,
        };
      }
      return undefined;
    },
  });
}
