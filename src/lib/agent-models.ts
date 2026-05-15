// Shared between server actions and client forms. Lives outside _actions/
// because Next.js Server Action files ('use server') may only export async
// functions — exporting plain values from them is a runtime error.

export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast & cheap)' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'gpt-4o', label: 'GPT-4o' },
] as const;

export type AvailableModelId = (typeof AVAILABLE_MODELS)[number]['id'];
