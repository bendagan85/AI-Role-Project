'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  getTenant,
  updateTenantConfig,
  updateTenantCategory,
} from '@/lib/repositories/tenant-repo';
import { AVAILABLE_MODELS } from '@/lib/agent-models';
import { classifyCoachRaw } from '@/lib/rag/classify';
import type { CoachCategory } from '@/lib/categories';

const agentConfigSchema = z.object({
  name: z.string().min(1, 'Required').max(80),
  agent_persona: z.string().min(1, 'Required').max(500),
  agent_system_prompt: z.string().min(1, 'Required').max(5000),
  llm_model: z.enum(AVAILABLE_MODELS.map((m) => m.id) as [string, ...string[]]),
  temperature: z.number().min(0).max(1),
  retrieval_k: z.number().int().min(1).max(50),
});

export type AgentConfigInput = z.infer<typeof agentConfigSchema>;

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

  // Classify FIRST so an off-domain persona is blocked before anything is
  // persisted. classifyCoachRaw throws on a model/transport error; we treat
  // "confidently classified as other" as a hard block, but a classifier
  // outage as fail-open — never lock a coach out of their own form over an
  // Anthropic blip.
  let classified: CoachCategory | null = null;
  try {
    classified = await classifyCoachRaw(
      parsed.data.agent_persona,
      parsed.data.agent_system_prompt,
      parsed.data.name,
    );
  } catch (err) {
    console.error('[updateAgentConfig] classifier unavailable (failing open):', err);
  }

  if (classified === 'other') {
    return {
      ok: false,
      error:
        'Your persona and system prompt must clearly describe a training or ' +
        'nutrition coach so clients can find you. Add domain-specific wording ' +
        '(e.g. strength training, sports nutrition) and save again.',
    };
  }

  try {
    await updateTenantConfig(supabase, user.id, parsed.data);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Update failed',
    };
  }

  // Persist the category. On classifier success use the fresh value; if the
  // classifier was unavailable, keep the coach's existing category rather
  // than downgrading a working coach to 'other' on an API blip.
  let category: CoachCategory = classified ?? 'other';
  try {
    if (classified) {
      await updateTenantCategory(supabase, user.id, classified);
    } else {
      const tenant = await getTenant(supabase, user.id);
      category = tenant?.category ?? 'other';
    }
  } catch (err) {
    console.error('[updateAgentConfig] category persist failed (non-fatal):', err);
  }

  revalidatePath('/admin/agent');
  revalidatePath('/admin');
  revalidatePath('/app');
  revalidatePath('/');
  return { ok: true, category };
}
