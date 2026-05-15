// Single source of truth for coach categories. The landing page renders
// one section per category, and the AI classifier in src/lib/rag/classify.ts
// returns one of these ids.
//
// Keep `other` last — the landing hides it when no coaches sit in it, so
// it's a graceful fallback for anyone the classifier can't place.

export const COACH_CATEGORIES = [
  {
    id: 'training',
    label: 'Training',
    emoji: '💪',
    description: 'Strength, conditioning, exercise programming, technique.',
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    emoji: '🥗',
    description: 'Diet, performance nutrition, meal planning, supplements.',
  },
  {
    id: 'other',
    label: 'Other',
    emoji: '✨',
    description: 'Coaches across other domains.',
  },
] as const;

export type CoachCategory = (typeof COACH_CATEGORIES)[number]['id'];

export function categoryMeta(id: CoachCategory) {
  return COACH_CATEGORIES.find((c) => c.id === id) ?? COACH_CATEGORIES[2];
}
