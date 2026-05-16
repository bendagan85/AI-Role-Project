import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type { CoachCategory } from '@/lib/categories';

// Schema constrains the model's output to the three category ids defined
// in src/lib/categories.ts. Keep this in sync if categories change.
const classificationSchema = z.object({
  category: z.enum(['training', 'nutrition', 'other']),
});

const CLASSIFIER_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Classify a coach into one of the supported categories from their persona
 * and system prompt (and optionally their display name). Uses Claude Haiku
 * — fast (~300–800ms) and cheap (~$0.0001 per call).
 *
 * THROWS on any model/transport error. Callers decide the failure policy:
 *  - the seed / directory path swallows it (see `classifyCoach`);
 *  - the agent-config save fails OPEN (keeps the existing category) so a
 *    transient Anthropic outage never locks a coach out of their own form.
 */
export async function classifyCoachRaw(
  persona: string,
  systemPrompt: string,
  name?: string,
): Promise<CoachCategory> {
  const { object } = await generateObject({
    model: anthropic(CLASSIFIER_MODEL),
    schema: classificationSchema,
    prompt: [
      'You categorize coaches for a directory.',
      '',
      'Read the coach below and choose the single best category.',
      '',
      'Categories:',
      '- training: strength, conditioning, exercise, sports performance, technique coaching.',
      '- nutrition: dietitians, performance nutrition, meal planning, supplements.',
      '- other: anything that does not clearly fit training or nutrition (mindset, life, business, gaming, language, entertainment, etc.).',
      '',
      ...(name ? [`Name: ${name}`, ''] : []),
      `Persona: ${persona}`,
      '',
      `System prompt: ${systemPrompt}`,
      '',
      'Respond with the single best category id.',
    ].join('\n'),
  });
  return object.category;
}

/**
 * Back-compatible wrapper: classify a coach, returning 'other' on any
 * error. Used by the seed script and anywhere a misfire should degrade
 * gracefully rather than surface an error.
 */
export async function classifyCoach(
  persona: string,
  systemPrompt: string,
): Promise<CoachCategory> {
  try {
    return await classifyCoachRaw(persona, systemPrompt);
  } catch (err) {
    console.error('[classify] coach classify failed, falling back to "other":', err);
    return 'other';
  }
}

const relevanceSchema = z.object({
  category: z.enum(['training', 'nutrition', 'other']),
  reason: z.string(),
});

export type DocumentRelevance = {
  category: CoachCategory;
  reason: string;
};

// Only sample the head of the document — off-domain content is obvious
// from the first page or two, which keeps the call cheap and fast even
// for a 50-page PDF.
const RELEVANCE_SAMPLE_CHARS = 6000;

/**
 * Decide what an ingested document is primarily about, so ingestion can
 * reject material that doesn't belong in a fitness / performance-nutrition
 * knowledge base. Returns the document's own best-fit category plus a short
 * human reason.
 *
 * The platform domain is fitness + performance nutrition, so a training
 * coach may legitimately hold nutrition material and vice versa — callers
 * should reject ONLY when category === 'other'.
 *
 * Fails OPEN: on any model/transport error returns
 * `{ category: 'training', reason: '' }` so a transient Anthropic outage
 * never drops a coach's legitimate upload.
 */
export async function classifyDocumentRelevance(
  text: string,
): Promise<DocumentRelevance> {
  const sample = text.slice(0, RELEVANCE_SAMPLE_CHARS);
  try {
    const { object } = await generateObject({
      model: anthropic(CLASSIFIER_MODEL),
      schema: relevanceSchema,
      prompt: [
        'You are a content gate for a fitness & performance-nutrition',
        'knowledge base. Decide what the document below is primarily about.',
        '',
        'Categories:',
        '- training: strength, conditioning, exercise, sports performance, technique, programming, mobility, recovery.',
        '- nutrition: diet, performance nutrition, meal planning, hydration, supplements, body composition.',
        '- other: anything not substantially about training or nutrition (e.g. gaming, software, politics, entertainment, general trivia).',
        '',
        'Judge the dominant subject of the document as a whole. A brief',
        'aside is fine; classify by what the document is mostly for.',
        '',
        'Document (sampled from the start):',
        '"""',
        sample,
        '"""',
        '',
        'Respond with the best category id and a one-sentence reason.',
      ].join('\n'),
    });
    return { category: object.category, reason: object.reason };
  } catch (err) {
    console.error('[classify] document relevance failed, failing open:', err);
    return { category: 'training', reason: '' };
  }
}
