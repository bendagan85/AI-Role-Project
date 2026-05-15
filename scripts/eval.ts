/**
 * Lightweight eval harness. For each golden question: resolve the coach,
 * run the real hybrid retrieval + system prompt, generate one answer with
 * Claude, and check the assertion. Prints a pass/fail table and exits
 * non-zero if anything fails (so CI can gate on it later if desired).
 *
 * Usage: pnpm eval
 * Cost:  ~$0.05 total (embeddings + ~20 short Claude calls).
 */

import './_bootstrap';

import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { createAdminClient } from '../src/lib/supabase/admin';
import { getTenant } from '../src/lib/repositories/tenant-repo';
import { hybridSearch } from '../src/lib/rag/retrieve';
import { composeSystemPrompt } from '../src/lib/rag/prompts';
import { GOLDEN } from '../evals/golden';

const REFUSAL_MARKERS = [
  "don't have",
  'do not have',
  "doesn't contain",
  'does not contain',
  'not in my knowledge',
  'knowledge base',
  'outside',
  "can't help",
  'cannot help',
  'unable to',
  'no information',
  "i'm not",
  'not able to',
];

async function emailToTenantId(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data?.users.find((u) => u.email === email)?.id ?? null;
}

type Result = {
  coach: string;
  question: string;
  kind: string;
  pass: boolean;
  reason: string;
};

async function main() {
  const admin = createAdminClient();
  const results: Result[] = [];

  // Cache tenant lookups.
  const tenantCache = new Map<string, string>();

  for (const c of GOLDEN) {
    let tenantId = tenantCache.get(c.coachEmail);
    if (!tenantId) {
      const resolved = await emailToTenantId(admin, c.coachEmail);
      if (!resolved) {
        results.push({
          coach: c.coachEmail,
          question: c.question,
          kind: c.kind,
          pass: false,
          reason: 'coach not found — did you run `pnpm seed`?',
        });
        continue;
      }
      tenantId = resolved;
      tenantCache.set(c.coachEmail, tenantId);
    }

    const tenant = await getTenant(admin, tenantId);
    if (!tenant) {
      results.push({
        coach: c.coachEmail,
        question: c.question,
        kind: c.kind,
        pass: false,
        reason: 'tenant row missing',
      });
      continue;
    }

    const { chunks, lowConfidence } = await hybridSearch(
      admin,
      tenantId,
      c.question,
      tenant.retrieval_k,
    );
    const system = composeSystemPrompt({ tenant, chunks, lowConfidence, userProfile: null });

    const { text } = await generateText({
      model: anthropic(tenant.llm_model.startsWith('claude') ? tenant.llm_model : 'claude-sonnet-4-6'),
      system,
      prompt: c.question,
      temperature: tenant.temperature,
    });

    const lower = text.toLowerCase();
    let pass = false;
    let reason = '';

    if (c.kind === 'refusal') {
      pass = REFUSAL_MARKERS.some((m) => lower.includes(m));
      reason = pass ? 'declined as expected' : 'did NOT refuse an out-of-scope question';
    } else {
      const hitKeyword = (c.expectKeywords ?? []).some((k) =>
        lower.includes(k.toLowerCase()),
      );
      const hasCitation = text.includes('[');
      pass = hitKeyword && hasCitation;
      reason = !hitKeyword
        ? `missing expected keyword (${(c.expectKeywords ?? []).join(' | ')})`
        : !hasCitation
          ? 'answer had no [citation]'
          : 'answered + cited';
    }

    results.push({
      coach: c.coachEmail.split('@')[0],
      question: c.question.slice(0, 50),
      kind: c.kind,
      pass,
      reason,
    });
  }

  // Print table.
  console.log('\n=== Eval results ===\n');
  let passed = 0;
  for (const r of results) {
    const mark = r.pass ? '✓ PASS' : '✗ FAIL';
    if (r.pass) passed += 1;
    console.log(`${mark}  [${r.kind}] ${r.coach} — "${r.question}…"`);
    if (!r.pass) console.log(`        ↳ ${r.reason}`);
  }
  console.log(`\n${passed}/${results.length} passed\n`);

  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval failed to run:', err);
  process.exit(1);
});
