'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { updateTenantConfig, updateTenantCategory } from '@/lib/repositories/tenant-repo';
import { AVAILABLE_MODELS } from '@/lib/agent-models';
import { classifyCoach } from '@/lib/rag/classify';

const agentConfigSchema = z.object({
  name: z.string().min(1, 'Required').max(80),
  agent_persona: z.string().min(1, 'Required').max(500),
  agent_system_prompt: z.string().min(1, 'Required').max(5000),
  llm_model: z.enum(AVAILABLE_MODELS.map((m) => m.id) as [string, ...string[]]),
  temperature: z.number().min(0).max(1),
  retrieval_k: z.number().int().min(1).max(50),
});

export type AgentConfigInput = z.infer<typeof agentConfigSchema>;

import type { CoachCategory } from '@/lib/categories';

export type AgentUpdateResult =
  | { ok: true; category: CoachCategory }
  | { ok: false; error: string };

export async function updateAgentConfig(input: AgentConfigInput): Promise<AgentUpdateResult> {
  const parsed = agentConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Unauthenticated' };
  }

  try {
    await updateTenantConfig(supabase, user.id, parsed.data);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Update failed',
    };
  }

  // Re-classify the coach into Training / Nutrition / Other based on the
  // updated persona + system prompt. Awaited so /admin and / reflect the
  // new category immediately on next render. Falls back to 'other' on any
  // error inside classifyCoach itself.
  let category: CoachCategory = 'other';
  try {
    category = await classifyCoach(
      parsed.data.agent_persona,
      parsed.data.agent_system_prompt,
    );
    await updateTenantCategory(supabase, user.id, category);
  } catch (err) {
    console.error('[updateAgentConfig] classify failed (non-fatal):', err);
  }

  revalidatePath('/admin/agent');
  revalidatePath('/admin');
  revalidatePath('/app');
  revalidatePath('/');
  return { ok: true, category };
}
