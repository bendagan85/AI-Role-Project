import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import type { CoachCategory } from '@/lib/categories';

// Schema constrains the model's output to the three category ids defined
// in src/lib/categories.ts. Keep this in sync if categories change.
const classificationSchema = z.object({
  category: z.enum(['training', 'nutrition', 'other']),
});

/**
 * Classify a coach into one of the supported categories based on their
 * persona and system prompt. Uses Claude Haiku — fast (~300–800ms) and
 * cheap (~$0.0001 per call).
 *
 * Failure mode: returns 'other' on any error. The landing hides the
 * 'other' section when empty, so a misfire never shows broken UI.
 */
export async function classifyCoach(
  persona: string,
  systemPrompt: string,
): Promise<CoachCategory> {
  try {
    const { object } = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: classificationSchema,
      prompt: [
        'You categorize coaches for a directory.',
        '',
        'Read the persona and system prompt below and choose the single best category.',
        '',
        'Categories:',
        '- training: strength, conditioning, exercise, sports performance, technique coaching.',
        '- nutrition: dietitians, performance nutrition, meal planning, supplements.',
        '- other: anything that does not clearly fit training or nutrition (mindset, life, business, language, etc.).',
        '',
        `Persona: ${persona}`,
        '',
        `System prompt: ${systemPrompt}`,
        '',
        'Respond with the single best category id.',
      ].join('\n'),
    });
    return object.category;
  } catch (err) {
    console.error('[classify] failed, falling back to "other":', err);
    return 'other';
  }
}
