import { redirect } from 'next/navigation';
import { ChatInterface } from '@/components/chat/chat-interface';
import { createClient } from '@/lib/supabase/server';
import { getTenant } from '@/lib/repositories/tenant-repo';

// The "Test as yourself" surface. Deliberately ephemeral: it points at the
// coach's own widget endpoint (no persistence) and passes no conversationId
// and no onMessagesChange, so nothing is written to the DB or localStorage.
// Every visit starts a clean conversation — it's a scratchpad for verifying
// tone and grounding, not a place to accumulate chat history. Real client
// conversation history lives in the public widget (localStorage + sidebar).

export default async function AppHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const tenant = await getTenant(supabase, user.id);

  return (
    <ChatInterface
      apiEndpoint={`/api/widget/chat/${user.id}`}
      agentName={tenant?.name ?? null}
      placeholder={`Ask ${tenant?.name ?? 'your coach'} anything…`}
    />
  );
}
