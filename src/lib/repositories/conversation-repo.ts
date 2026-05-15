import type { SupabaseClient } from '@supabase/supabase-js';

export type Conversation = {
  id: string;
  tenant_id: string;
  user_profile: Record<string, unknown>;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export async function listConversations(
  supabase: SupabaseClient,
  tenantId: string,
  limit = 50,
): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listConversations: ${error.message}`);
  return (data ?? []) as Conversation[];
}

export async function getConversation(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getConversation: ${error.message}`);
  return data as Conversation | null;
}

export async function getOrCreateLatestConversation(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOrCreateLatestConversation: ${error.message}`);
  if (data) return data as Conversation;
  return createConversation(supabase, tenantId);
}

export async function createConversation(
  supabase: SupabaseClient,
  tenantId: string,
  title?: string,
): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ tenant_id: tenantId, title: title ?? null })
    .select()
    .single();
  if (error) throw new Error(`createConversation: ${error.message}`);
  return data as Conversation;
}

export async function touchConversation(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: Partial<Pick<Conversation, 'title' | 'user_profile'>> = {},
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', id);
  if (error) throw new Error(`touchConversation: ${error.message}`);
}
