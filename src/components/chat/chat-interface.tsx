'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/chat/markdown';
import { CitationChips } from '@/components/chat/citation-chips';
import type { Citation } from '@/lib/rag/retrieve';

type AssistantMetadata = {
  conversationId?: string;
  citations?: Citation[];
  lowConfidence?: boolean;
};

export type ChatInterfaceProps = {
  conversationId?: string;
  initialMessages?: UIMessage[];
  agentName?: string | null;
  placeholder?: string;
  apiEndpoint?: string;
  /** When true, hide the auto-scroll fixed height and let parent container drive layout. */
  embedded?: boolean;
  /**
   * Fires whenever the in-memory messages list changes. The parent can use
   * this to persist messages (e.g. localStorage for the widget) without
   * ChatInterface owning persistence itself.
   */
  onMessagesChange?: (messages: UIMessage[]) => void;
};

function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('');
}

function citationsFromMessage(m: UIMessage): Citation[] {
  const meta = m.metadata as AssistantMetadata | undefined;
  return meta?.citations ?? [];
}

export function ChatInterface({
  conversationId,
  initialMessages = [],
  agentName,
  placeholder,
  apiEndpoint = '/api/chat',
  embedded = false,
  onMessagesChange,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Stabilise transport across renders — otherwise useChat re-initializes the
  // connection on every render and pending streams can be dropped.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiEndpoint,
        body: conversationId ? { conversationId } : {},
      }),
    [apiEndpoint, conversationId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId ?? `chat-${apiEndpoint}`,
    messages: initialMessages,
    transport,
  });

  // Bubble message changes up so the parent can persist (e.g. WidgetChat to
  // localStorage, or admin code to a DB). The parent decides what to do.
  useEffect(() => {
    if (onMessagesChange) onMessagesChange(messages);
  }, [messages, onMessagesChange]);

  // Auto-scroll on new messages or streaming updates.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setInput('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e as unknown as React.FormEvent);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div
      className={embedded ? 'flex h-screen flex-col' : 'flex h-[calc(100vh-4rem)] flex-col'}
    >
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center pb-8 text-center">
            <p className="text-foreground text-base font-medium">
              {agentName ? `Chat with ${agentName}` : 'Start a conversation'}
            </p>
            <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
              Ask anything — the agent will answer from the knowledge base and cite its sources.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 py-6">
            {messages.map((m) => {
              const text = messageText(m);
              const citations = m.role === 'assistant' ? citationsFromMessage(m) : [];
              return (
                <div
                  key={m.id}
                  className={
                    m.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                  }
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground max-w-[80%] rounded-lg px-4 py-2.5'
                        : 'bg-muted/40 max-w-[90%] rounded-lg border px-4 py-2.5'
                    }
                  >
                    {m.role === 'assistant' ? (
                      <Markdown>{text || '…'}</Markdown>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{text}</p>
                    )}
                    {m.role === 'assistant' && citations.length > 0 && (
                      <CitationChips citations={citations} />
                    )}
                  </div>
                </div>
              );
            })}
            {error && (
              <div className="bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm">
                {error.message || 'Something went wrong'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-background border-t px-4 pt-4 pb-16">
        <form onSubmit={onSubmit} className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder ?? 'Send a message…'}
              rows={1}
              className="max-h-40 min-h-[44px] resize-none"
              disabled={busy}
            />
            <Button type="submit" disabled={busy || input.trim().length === 0}>
              {busy ? '…' : 'Send'}
            </Button>
          </div>
          <p className="text-muted-foreground mt-2 text-center text-[11px]">
            Press Enter to send · Shift+Enter for newline
          </p>
        </form>
      </div>
    </div>
  );
}
