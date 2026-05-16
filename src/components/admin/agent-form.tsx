'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateAgentConfig } from '@/app/_actions/agent';
import { AVAILABLE_MODELS } from '@/lib/agent-models';
import type { Tenant } from '@/lib/repositories/tenant-repo';

const formSchema = z.object({
  name: z.string().min(1, 'Required').max(80),
  agent_persona: z.string().min(1, 'Required').max(500),
  agent_system_prompt: z.string().min(1, 'Required').max(5000),
  llm_model: z.string().min(1),
  temperature: z.number().min(0).max(1),
  retrieval_k: z.number().int().min(1).max(50),
});

type FormValues = z.infer<typeof formSchema>;

export function AgentForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tenant.name,
      agent_persona: tenant.agent_persona,
      agent_system_prompt: tenant.agent_system_prompt,
      llm_model: tenant.llm_model,
      temperature: tenant.temperature,
      retrieval_k: tenant.retrieval_k,
    },
  });

  const temperature = watch('temperature');
  const retrievalK = watch('retrieval_k');
  const model = watch('llm_model');

  async function onSubmit(values: FormValues) {
    setPending(true);
    const result = await updateAgentConfig(values);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.category === 'training' || result.category === 'nutrition') {
      const label = result.category === 'training' ? 'Training' : 'Nutrition';
      toast.success(`Saved · classified as ${label}`);
    } else {
      // Only reachable if the classifier was unavailable at save time; the
      // config was still saved and the existing category preserved.
      toast.success('Saved');
    }
    startTransition(() => {
      router.push('/admin');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Workspace name */}
      <section className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Workspace name
        </label>
        <Input id="name" {...register('name')} />
        <p className="text-muted-foreground text-xs">
          Shown in the header and on the welcome screen.
        </p>
        {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
      </section>

      {/* Persona */}
      <section className="space-y-2">
        <label htmlFor="agent_persona" className="text-sm font-medium">
          Persona
        </label>
        <Input
          id="agent_persona"
          {...register('agent_persona')}
          placeholder="e.g. Coach Marcus, an evidence-based strength coach"
        />
        <p className="text-muted-foreground text-xs">
          One sentence describing who the agent is. Used as the opening line of the system prompt.
        </p>
        {errors.agent_persona && (
          <p className="text-destructive text-xs">{errors.agent_persona.message}</p>
        )}
      </section>

      {/* System prompt */}
      <section className="space-y-2">
        <label htmlFor="agent_system_prompt" className="text-sm font-medium">
          System prompt
        </label>
        <Textarea
          id="agent_system_prompt"
          {...register('agent_system_prompt')}
          rows={6}
          placeholder="Detailed instructions for tone, scope, and behaviour…"
        />
        <p className="text-muted-foreground text-xs">
          Tone, refusal rules, domain constraints. The grounding rule (cite sources, don&apos;t
          hallucinate) is added automatically on top of whatever you write here.
        </p>
        {errors.agent_system_prompt && (
          <p className="text-destructive text-xs">{errors.agent_system_prompt.message}</p>
        )}
      </section>

      {/* Model */}
      <section className="space-y-2">
        <label htmlFor="llm_model" className="text-sm font-medium">
          Chat model
        </label>
        <Select
          value={model}
          onValueChange={(v) => v && setValue('llm_model', v, { shouldDirty: true })}
        >
          <SelectTrigger id="llm_model" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AVAILABLE_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          Claude models need <code>ANTHROPIC_API_KEY</code>, GPT models need{' '}
          <code>OPENAI_API_KEY</code>.
        </p>
      </section>

      {/* Temperature */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="temperature" className="text-sm font-medium">
            Temperature
          </label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {temperature.toFixed(2)}
          </span>
        </div>
        <Slider
          id="temperature"
          min={0}
          max={1}
          step={0.05}
          value={[temperature]}
          onValueChange={(v) =>
            setValue('temperature', Array.isArray(v) ? v[0] : v, { shouldDirty: true })
          }
        />
        <p className="text-muted-foreground text-xs">
          0 = deterministic / always cites carefully. 1 = creative. 0.3 is a good default for RAG.
        </p>
      </section>

      {/* Retrieval k */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="retrieval_k" className="text-sm font-medium">
            Retrieval k (chunks per question)
          </label>
          <span className="text-muted-foreground text-xs tabular-nums">{retrievalK}</span>
        </div>
        <Slider
          id="retrieval_k"
          min={1}
          max={20}
          step={1}
          value={[retrievalK]}
          onValueChange={(v) =>
            setValue('retrieval_k', Array.isArray(v) ? v[0] : v, { shouldDirty: true })
          }
        />
        <p className="text-muted-foreground text-xs">
          Higher = more context for the model, but slower and more tokens. 8 is a balanced default.
        </p>
      </section>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button type="submit" disabled={pending || !isDirty}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
