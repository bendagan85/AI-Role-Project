/**
 * Seed two demo tenants (StrengthLab + FuelRight) with their personas,
 * system prompts, and the markdown files in seed-data/{tenant}/.
 *
 * Idempotent: re-running won't duplicate users, will replace existing docs
 * of the same title (clean re-ingestion).
 *
 * Usage:
 *   pnpm seed
 *
 * Required env vars (loaded from .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 *   ANTHROPIC_API_KEY  (used by the category classifier)
 */

import './_bootstrap';

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createAdminClient } from '../src/lib/supabase/admin';
import { chunkText } from '../src/lib/rag/chunk';
import { embedTexts } from '../src/lib/rag/embed';
import { classifyCoach } from '../src/lib/rag/classify';

const SEED_PASSWORD = 'Demo1234!';

type SeedTenant = {
  email: string;
  workspaceName: string;
  persona: string;
  systemPrompt: string;
  seedFolder: string;
  defaultModel: string;
};

const TENANTS: SeedTenant[] = [
  {
    email: 'coach.marcus@strengthlab.demo',
    workspaceName: 'StrengthLab',
    persona:
      'Coach Marcus, an evidence-based strength and conditioning coach. Practical, direct, focused on long-term progress.',
    systemPrompt: [
      'You are Coach Marcus, an evidence-based strength and conditioning coach.',
      'Use the knowledge base to give specific, practical, safe advice.',
      'Tailor recommendations to the user\'s level and goal when stated.',
      'Cite sources by document title in brackets like [Document Title].',
      'If the context does not contain what is needed, say so plainly and suggest a related topic from the knowledge base.',
      'Never invent specific numbers, percentages, or anatomical claims that are not in the provided context.',
    ].join(' '),
    seedFolder: 'strengthlab',
    defaultModel: 'claude-sonnet-4-6',
  },
  {
    email: 'coach.nina@fuelright.demo',
    workspaceName: 'FuelRight',
    persona:
      'Nina, a registered dietitian specializing in performance nutrition. Practical, non-restrictive, science-first.',
    systemPrompt: [
      'You are Nina, a registered dietitian specializing in performance nutrition.',
      'Use the knowledge base to give specific, practical, non-restrictive advice.',
      'Acknowledge individual variability — what works for most does not work for everyone.',
      'Cite sources by document title in brackets like [Document Title].',
      'Always include a brief reminder, when health questions arise, that you are not a substitute for medical advice.',
      'If the context does not cover what was asked, say so and suggest a related topic from the knowledge base.',
    ].join(' '),
    seedFolder: 'fuelright',
    defaultModel: 'claude-sonnet-4-6',
  },
];

// --------------------------------------------------------------------------
// User upsert
// --------------------------------------------------------------------------
async function ensureUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  workspaceName: string,
): Promise<string> {
  // Try to find existing user via admin API (no list-by-email so we page).
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);
  const existing = list?.users?.find((u) => u.email === email);
  if (existing) {
    console.log(`  ✓ User exists: ${email}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { name: workspaceName },
  });
  if (error || !data.user) {
    throw new Error(`createUser ${email}: ${error?.message ?? 'no user'}`);
  }
  console.log(`  ✓ Created user: ${email}`);
  return data.user.id;
}

// --------------------------------------------------------------------------
// Tenant config
// --------------------------------------------------------------------------
async function applyTenantConfig(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  t: SeedTenant,
): Promise<void> {
  const { error } = await admin
    .from('tenants')
    .update({
      name: t.workspaceName,
      agent_persona: t.persona,
      agent_system_prompt: t.systemPrompt,
      llm_model: t.defaultModel,
      temperature: 0.3,
      retrieval_k: 8,
    })
    .eq('id', tenantId);
  if (error) throw new Error(`applyTenantConfig: ${error.message}`);
  console.log(`  ✓ Tenant config updated`);

  // Auto-classify into Training / Nutrition / Other based on persona + prompt.
  const category = await classifyCoach(t.persona, t.systemPrompt);
  const { error: catErr } = await admin
    .from('tenants')
    .update({ category })
    .eq('id', tenantId);
  if (catErr) {
    console.warn(`  ! category update failed (non-fatal): ${catErr.message}`);
  } else {
    console.log(`  ✓ Classified as: ${category}`);
  }
}

// --------------------------------------------------------------------------
// Document ingestion (inline, no Inngest needed)
// --------------------------------------------------------------------------
async function ingestMarkdownFile(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  filePath: string,
  title: string,
): Promise<void> {
  const content = await readFile(filePath, 'utf8');

  // Delete existing doc with the same title (idempotent re-seed). Cascade
  // removes chunks and storage objects via the API (we handle storage below).
  const { data: existing } = await admin
    .from('documents')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('title', title);
  if (existing && existing.length > 0) {
    for (const doc of existing) {
      const prefix = `${tenantId}/${doc.id}`;
      const { data: objs } = await admin.storage.from('kb-uploads').list(prefix);
      if (objs && objs.length > 0) {
        await admin.storage
          .from('kb-uploads')
          .remove(objs.map((o) => `${prefix}/${o.name}`));
      }
      await admin.from('documents').delete().eq('id', doc.id);
    }
  }

  // Insert documents row.
  const { data: doc, error: docErr } = await admin
    .from('documents')
    .insert({
      tenant_id: tenantId,
      title,
      source_type: 'file',
      original_filename: `${title}.md`,
      mime_type: 'text/markdown',
      status: 'processing',
    })
    .select()
    .single();
  if (docErr || !doc) throw new Error(`insert documents: ${docErr?.message}`);

  // Upload raw content to Storage.
  const path = `${tenantId}/${doc.id}/${title}.md`;
  const { error: uploadErr } = await admin.storage
    .from('kb-uploads')
    .upload(path, new Blob([content], { type: 'text/markdown' }), {
      contentType: 'text/markdown',
      upsert: true,
    });
  if (uploadErr) throw new Error(`storage upload: ${uploadErr.message}`);

  // Chunk + embed inline.
  const pieces = chunkText(content);
  const vectors = await embedTexts(pieces.map((p) => p.content));

  // Insert chunks.
  const rows = pieces.map((p, i) => ({
    tenant_id: tenantId,
    document_id: doc.id,
    chunk_index: i,
    content: p.content,
    metadata: {},
    embedding: vectors[i],
    token_count: p.approxTokenCount,
  }));
  const { error: chunkErr } = await admin.from('chunks').insert(rows);
  if (chunkErr) throw new Error(`insert chunks: ${chunkErr.message}`);

  // Mark ready.
  const { error: statusErr } = await admin
    .from('documents')
    .update({ status: 'ready', chunk_count: rows.length })
    .eq('id', doc.id);
  if (statusErr) throw new Error(`status update: ${statusErr.message}`);

  console.log(`    ✓ ${title} — ${rows.length} chunks`);
}

// --------------------------------------------------------------------------
// Filename → human-readable title
// --------------------------------------------------------------------------
function fileToTitle(filename: string): string {
  // 01-squat-mechanics.md → "Squat Mechanics"
  return filename
    .replace(/^\d+[-_]/, '')
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  const admin = createAdminClient();
  const seedRoot = resolve(process.cwd(), 'seed-data');

  for (const t of TENANTS) {
    console.log(`\n=== ${t.workspaceName} (${t.email}) ===`);

    const tenantId = await ensureUser(admin, t.email, t.workspaceName);
    await applyTenantConfig(admin, tenantId, t);

    const folder = join(seedRoot, t.seedFolder);
    const files = (await readdir(folder)).filter((f) => f.endsWith('.md')).sort();
    console.log(`  Ingesting ${files.length} markdown files…`);

    for (const file of files) {
      const title = fileToTitle(file);
      try {
        await ingestMarkdownFile(admin, tenantId, join(folder, file), title);
      } catch (err) {
        console.error(`    ✗ ${title}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log('\n✅ Seed complete');
  console.log(`\nDemo accounts (password "${SEED_PASSWORD}"):`);
  for (const t of TENANTS) {
    console.log(`  - ${t.workspaceName.padEnd(12)} ${t.email}`);
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
