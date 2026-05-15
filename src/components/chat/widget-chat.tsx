'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { ChatInterface } from '@/components/chat/chat-interface';

// localStorage layout for the widget (anonymous trainees):
//
//   aicoach-chat-list:<tenantId>         JSON array of {id, title, updatedAt}
//   aicoach-chat:<tenantId>:<convId>     JSON array of UIMessages
//
// One list per coach + one message-array per conversation. Cleanly per-device,
// per-coach, and per-conversation — matches what trainees expect from a chat
// app sidebar.

type ConvMeta = {
  id: string;
  title: string;
  updatedAt: number;
};

type WidgetChatProps = {
  tenantId: string;
  agentName: string;
  apiEndpoint: string;
};

function listKey(tenantId: string) {
  return `aicoach-chat-list:${tenantId}`;
}
function convKey(tenantId: string, convId: string) {
  return `aicoach-chat:${tenantId}:${convId}`;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function deriveTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'New chat';
  const text = (firstUser.parts ?? [])
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim();
  if (text.length === 0) return 'New chat';
  return text.length > 50 ? text.slice(0, 50) + '…' : text;
}

export function WidgetChat({ tenantId, agentName, apiEndpoint }: WidgetChatProps) {
  const [hydrated, setHydrated] = useState(false);
  const [convs, setConvs] = useState<ConvMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<UIMessage[]>([]);

  // Hydrate from localStorage AFTER mount. This is deliberate: localStorage
  // is browser-only, so reading it during render (or in a useState
  // initializer) makes the server and client render different trees and
  // throws a hydration mismatch — a bug we already hit and fixed this way.
  // The state is computed once, synchronously, from a snapshot, then applied
  // in a single batch. The react-hooks/set-state-in-effect rule targets
  // cascading-render effects; one-shot client-only hydration is exactly the
  // documented exception, so it's scope-disabled here with this rationale.
  useEffect(() => {
    let nextConvs: ConvMeta[] = [];
    let nextActiveId = '';
    let nextMessages: UIMessage[] = [];
    try {
      const raw = window.localStorage.getItem(listKey(tenantId));
      const parsed = raw ? (JSON.parse(raw) as ConvMeta[]) : [];
      if (parsed.length > 0) {
        nextConvs = [...parsed].sort((a, b) => b.updatedAt - a.updatedAt);
        nextActiveId = nextConvs[0].id;
        const m = window.localStorage.getItem(convKey(tenantId, nextActiveId));
        if (m) {
          const parsedMessages = JSON.parse(m);
          if (Array.isArray(parsedMessages)) nextMessages = parsedMessages;
        }
      } else {
        nextActiveId = uuid();
      }
    } catch {
      nextActiveId = uuid();
    }
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot client-only
       hydration; see the comment above. */
    setConvs(nextConvs);
    setActiveId(nextActiveId);
    setActiveMessages(nextMessages);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [tenantId]);

  // Persist the list whenever it changes.
  const persistList = useCallback(
    (list: ConvMeta[]) => {
      try {
        window.localStorage.setItem(listKey(tenantId), JSON.stringify(list));
      } catch {
        /* ignore quota errors */
      }
    },
    [tenantId],
  );

  // Track last persisted message length so we don't write on every keystroke
  // of streaming text. We persist on any change but coalesce updates.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessagesChange = useCallback(
    (messages: UIMessage[]) => {
      if (!activeId) return;
      // Only persist when there's actually something to save.
      if (messages.length === 0) return;

      // Debounce so streaming doesn't hammer localStorage.
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        try {
          window.localStorage.setItem(convKey(tenantId, activeId), JSON.stringify(messages));
        } catch {
          /* ignore */
        }
        // Update list entry (title + updatedAt). Add it to the list if it
        // wasn't there yet — this is how a fresh chat enters the sidebar.
        setConvs((prev) => {
          const title = deriveTitle(messages);
          const existing = prev.find((c) => c.id === activeId);
          const next: ConvMeta = {
            id: activeId,
            title,
            updatedAt: Date.now(),
          };
          const list = existing
            ? prev.map((c) => (c.id === activeId ? next : c))
            : [next, ...prev];
          const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
          persistList(sorted);
          return sorted;
        });
      }, 250);
    },
    [activeId, tenantId, persistList],
  );

  function selectConversation(id: string) {
    if (id === activeId) return;
    try {
      const raw = window.localStorage.getItem(convKey(tenantId, id));
      const parsed = raw ? JSON.parse(raw) : [];
      setActiveMessages(Array.isArray(parsed) ? parsed : []);
    } catch {
      setActiveMessages([]);
    }
    setActiveId(id);
  }

  function newConversation() {
    const id = uuid();
    setActiveMessages([]);
    setActiveId(id);
  }

  function deleteConversation(id: string) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      window.localStorage.removeItem(convKey(tenantId, id));
    } catch {
      /* ignore */
    }
    setConvs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      persistList(next);
      // If we deleted the active conversation, switch to the most recent.
      if (id === activeId) {
        if (next.length > 0) {
          selectConversation(next[0].id);
        } else {
          newConversation();
        }
      }
      return next;
    });
  }

  const placeholder = useMemo(() => `Ask ${agentName} anything…`, [agentName]);

  return (
    <div className="bg-background flex h-full">
      {/* Sidebar */}
      <aside className="bg-muted/20 hidden w-60 shrink-0 flex-col border-r sm:flex">
        <div className="border-b px-3 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={newConversation}
          >
            + New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {convs.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-xs">
              No past chats. Send a message to start.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {convs.map((c) => (
                <li key={c.id}>
                  <div
                    className={
                      c.id === activeId
                        ? 'bg-background group flex items-center gap-2 rounded-md border px-2 py-1.5'
                        : 'hover:bg-background/60 group flex items-center gap-2 rounded-md px-2 py-1.5'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => selectConversation(c.id)}
                      className="flex-1 truncate text-left text-xs"
                      title={c.title}
                    >
                      <span className="block truncate font-medium">{c.title}</span>
                      <span className="text-muted-foreground block text-[10px]">
                        {relativeTime(c.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(c.id)}
                      className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                      title="Delete conversation"
                      aria-label="Delete conversation"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat — keyed on activeId so useChat resets cleanly between conversations */}
      <div className="flex-1 overflow-hidden">
        {hydrated && activeId && (
          <ChatInterface
            key={activeId}
            apiEndpoint={apiEndpoint}
            initialMessages={activeMessages}
            agentName={agentName}
            placeholder={placeholder}
            embedded
            onMessagesChange={onMessagesChange}
          />
        )}
      </div>
    </div>
  );
}
