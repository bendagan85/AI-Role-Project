import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoachCategory } from '@/lib/categories';

export type Tenant = {
  id: string;
  name: string;
  agent_persona: string;
  agent_system_prompt: string;
  llm_model: string;
  temperature: number;
  retrieval_k: number;
  category: CoachCategory;
  created_at: string;
};

export type TenantConfigUpdate = Partial<
  Pick<
    Tenant,
    | 'name'
    | 'agent_persona'
    | 'agent_system_prompt'
    | 'llm_model'
    | 'temperature'
    | 'retrieval_k'
  >
>;

// The tenants table is unusual: tenant_id IS the primary key (= auth.users.id),
// so the explicit filter is `.eq('id', tenantId)` instead of the usual
// `.eq('tenant_id', tenantId)`. See src/lib/repositories/AGENTS.md.
export async function getTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Tenant | null> {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`getTenant: ${error.message}`);
  return data as Tenant | null;
}

export async function updateTenantConfig(
  supabase: SupabaseClient,
  tenantId: string,
  update: TenantConfigUpdate,
): Promise<Tenant> {
  const { data, error } = await supabase
    .from('tenants')
    .update(update)
    .eq('id', tenantId)
    .select()
    .single();
  if (error) throw new Error(`updateTenantConfig: ${error.message}`);
  return data as Tenant;
}

export async function updateTenantCategory(
  supabase: SupabaseClient,
  tenantId: string,
  category: CoachCategory,
): Promise<void> {
  const { error } = await supabase
    .from('tenants')
    .update({ category })
    .eq('id', tenantId);
  if (error) throw new Error(`updateTenantCategory: ${error.message}`);
}
