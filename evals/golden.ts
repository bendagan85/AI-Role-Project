// Golden questions for the lightweight eval harness (scripts/eval.ts).
//
// Each case targets one of the seeded demo coaches by email. Two kinds:
//   - in-scope:  the answer must mention at least one expected keyword
//                AND cite a source (we check for a "[" bracket citation).
//   - refusal:   the question is outside the coach's KB; the answer must
//                decline gracefully (no fabrication).
//
// This is intentionally a small developer smoke test, not a scoring
// framework — enough to catch a regression in retrieval or prompt wiring.

export type GoldenCase = {
  coachEmail: string;
  question: string;
  kind: 'in-scope' | 'refusal';
  /** For in-scope: at least one of these (case-insensitive) must appear. */
  expectKeywords?: string[];
};

export const GOLDEN: GoldenCase[] = [
  // ---- StrengthLab / Coach Marcus (training) ------------------------------
  {
    coachEmail: 'coach.marcus@strengthlab.demo',
    question: 'What is RPE and how should I use it in training?',
    kind: 'in-scope',
    expectKeywords: ['perceived exertion', 'rpe', 'reps in', 'in the tank'],
  },
  {
    coachEmail: 'coach.marcus@strengthlab.demo',
    question: 'My knees cave in when I squat. How do I fix that?',
    kind: 'in-scope',
    expectKeywords: ['floor', 'spread', 'push', 'valgus', 'knees out'],
  },
  {
    coachEmail: 'coach.marcus@strengthlab.demo',
    question: 'How should I structure a deload week?',
    kind: 'in-scope',
    expectKeywords: ['deload', '50', '60', 'volume', 'intensity'],
  },
  {
    coachEmail: 'coach.marcus@strengthlab.demo',
    question: "I'm completely new to lifting. Where should I start?",
    kind: 'in-scope',
    expectKeywords: ['linear', 'novice', 'beginner', 'compound', 'progression'],
  },
  {
    coachEmail: 'coach.marcus@strengthlab.demo',
    question: 'What is the capital of France?',
    kind: 'refusal',
  },
  {
    coachEmail: 'coach.marcus@strengthlab.demo',
    question: 'Give me a detailed 7-day vegan meal plan with macros.',
    kind: 'refusal',
  },

  // ---- FuelRight / Nina (nutrition) ---------------------------------------
  {
    coachEmail: 'coach.nina@fuelright.demo',
    question: 'How much protein should an active adult eat per day?',
    kind: 'in-scope',
    expectKeywords: ['1.6', '2.2', '2.0', 'g/kg', 'gram'],
  },
  {
    coachEmail: 'coach.nina@fuelright.demo',
    question: 'What is TDEE and how do I estimate mine?',
    kind: 'in-scope',
    expectKeywords: ['total daily energy', 'energy expenditure', 'bmr', 'activity'],
  },
  {
    coachEmail: 'coach.nina@fuelright.demo',
    question: 'Is creatine worth taking?',
    kind: 'in-scope',
    expectKeywords: ['creatine', 'monohydrate', '3', '5', 'strength'],
  },
  {
    coachEmail: 'coach.nina@fuelright.demo',
    question: 'How should I set up a barbell back squat?',
    kind: 'refusal',
  },
  {
    coachEmail: 'coach.nina@fuelright.demo',
    question: 'What movies should I watch this weekend?',
    kind: 'refusal',
  },
];
