import type { SupabaseClient } from '@supabase/supabase-js';
import type { Citation } from '@/lib/rag/retrieve';

export type MessageRole = 'user' | 'assistant' | 'system';

export type Message = {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  created_at: string;
};

export async function listMessages(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listMessages: ${error.message}`);
  return (data ?? []) as Message[];
}

export async function insertMessage(
  supabase: SupabaseClient,
  tenantId: string,
  conversationId: string,
  role: MessageRole,
  content: string,
  citations: Citation[] = [],
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      role,
      content,
      citations,
    })
    .select()
    .single();
  if (error) throw new Error(`insertMessage: ${error.message}`);
  return data as Message;
}
