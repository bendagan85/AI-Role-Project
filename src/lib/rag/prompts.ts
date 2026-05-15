import type { Tenant } from '@/lib/repositories/tenant-repo';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import { formatChunksForPrompt, LOW_CONFIDENCE_THRESHOLD } from '@/lib/rag/retrieve';

const GROUNDING_INSTRUCTIONS = `
Answer using ONLY the context below. Cite sources by document title in brackets like [Document Title].
If the context does not contain what's needed, say so explicitly and suggest a related topic from the knowledge base. Do not invent facts.
When the user asks for recommendations or what to do next, surface the most relevant items from the knowledge base.

Language: ALWAYS reply in the same language the user wrote their latest message in. If they write in Hebrew, answer entirely in Hebrew; if in English, answer entirely in English. Never mix languages in one reply (proper nouns and document titles may stay as-is). Keep source citations in their original document-title form.

Small talk: for greetings or pleasantries (e.g. "hi", "how are you", "מה נשמע") reply briefly and warmly in one short sentence, then invite a question about your area of expertise. Do NOT dump a list of knowledge-base topics in response to a greeting.
`.trim();

const LOW_CONFIDENCE_HINT = `
NOTE: Retrieval for this query returned only low-similarity matches (max cosine < ${LOW_CONFIDENCE_THRESHOLD}). Be especially careful — if the context below does not directly address the user's question, say so plainly and point them to a related topic instead of guessing.
`.trim();

export type SystemPromptInputs = {
  tenant: Tenant;
  chunks: RetrievedChunk[];
  lowConfidence: boolean;
  userProfile?: Record<string, unknown> | null;
};

export function composeSystemPrompt({
  tenant,
  chunks,
  lowConfidence,
  userProfile,
}: SystemPromptInputs): string {
  const sections: string[] = [];

  // 1. Persona line
  sections.push(`You are ${tenant.agent_persona || 'a knowledgeable coach'}.`);

  // 2. Tenant's custom system prompt (overridable in admin)
  if (tenant.agent_system_prompt?.trim()) {
    sections.push(tenant.agent_system_prompt.trim());
  }

  // 3. Hard grounding rules (always)
  sections.push(GROUNDING_INSTRUCTIONS);

  // 4. Optional user profile block (Phase 8 bonus)
  if (userProfile && Object.keys(userProfile).length > 0) {
    const profile = Object.entries(userProfile)
      .map(([k, v]) => `- ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join('\n');
    sections.push(`User profile (use to personalize advice when relevant):\n${profile}`);
  }

  // 5. Retrieved context
  sections.push(`Context:\n---\n${formatChunksForPrompt(chunks)}\n---`);

  // 6. Low-confidence hint
  if (lowConfidence) {
    sections.push(LOW_CONFIDENCE_HINT);
  }

  return sections.join('\n\n');
}
