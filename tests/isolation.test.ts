import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cross-tenant isolation test.
 *
 * The assignment states: "Clear isolation: User A must never retrieve
 * content from User B's KB. This will be tested." This file IS that test.
 *
 * It is self-contained: it provisions two throwaway users with the
 * service-role key, gives each a document + chunk, then signs in as each
 * (anon client, so RLS applies) and asserts that neither can read the
 * other's rows. Fixtures are torn down in afterAll (deleteUser cascades
 * through tenants → documents → chunks via the FK on delete cascade).
 *
 * We insert a dummy zero vector for the embedding — this test exercises
 * Row Level Security, not retrieval quality, so no OpenAI call is needed.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DUMMY_EMBEDDING = JSON.stringify(new Array(1536).fill(0));
const PASSWORD = 'IsolationTest123!';

type Fixture = {
  userId: string;
  email: string;
  documentId: string;
};

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function provision(adminClient: SupabaseClient, tag: string): Promise<Fixture> {
  const email = `iso-${tag}-${Date.now()}@test.local`;
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: `Isolation ${tag}` },
  });
  if (createErr || !created.user) {
    throw new Error(`createUser(${tag}): ${createErr?.message ?? 'no user'}`);
  }
  const userId = created.user.id;

  // The on_auth_user_created trigger makes the tenants row. Insert a doc + chunk.
  const { data: doc, error: docErr } = await adminClient
    .from('documents')
    .insert({
      tenant_id: userId,
      title: `secret-${tag}`,
      source_type: 'text',
      status: 'ready',
      chunk_count: 1,
    })
    .select()
    .single();
  if (docErr || !doc) throw new Error(`insert document(${tag}): ${docErr?.message}`);

  const { error: chunkErr } = await adminClient.from('chunks').insert({
    tenant_id: userId,
    document_id: doc.id,
    chunk_index: 0,
    content: `TOP SECRET content belonging to ${tag} only`,
    embedding: DUMMY_EMBEDDING,
    token_count: 8,
  });
  if (chunkErr) throw new Error(`insert chunk(${tag}): ${chunkErr.message}`);

  return { userId, email, documentId: doc.id };
}

async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

describe('cross-tenant isolation (RLS)', () => {
  const adminClient = admin();
  let a: Fixture;
  let b: Fixture;

  beforeAll(async () => {
    a = await provision(adminClient, 'a');
    b = await provision(adminClient, 'b');
  });

  afterAll(async () => {
    if (a?.userId) await adminClient.auth.admin.deleteUser(a.userId).catch(() => {});
    if (b?.userId) await adminClient.auth.admin.deleteUser(b.userId).catch(() => {});
  });

  it('A can read its own chunks and documents', async () => {
    const clientA = await signedInClient(a.email);
    const { data: chunks } = await clientA.from('chunks').select('*');
    const { data: docs } = await clientA.from('documents').select('*');
    expect((chunks ?? []).length).toBeGreaterThanOrEqual(1);
    expect((docs ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('A cannot read B chunks even with an explicit tenant_id filter', async () => {
    const clientA = await signedInClient(a.email);
    const { data } = await clientA.from('chunks').select('*').eq('tenant_id', b.userId);
    expect(data ?? []).toHaveLength(0);
  });

  it('A cannot read B documents even with an explicit tenant_id filter', async () => {
    const clientA = await signedInClient(a.email);
    const { data } = await clientA.from('documents').select('*').eq('tenant_id', b.userId);
    expect(data ?? []).toHaveLength(0);
  });

  it('A cannot read B tenant config row', async () => {
    const clientA = await signedInClient(a.email);
    const { data } = await clientA.from('tenants').select('*').eq('id', b.userId);
    expect(data ?? []).toHaveLength(0);
  });

  it('B cannot read A chunks (reverse direction)', async () => {
    const clientB = await signedInClient(b.email);
    const { data } = await clientB.from('chunks').select('*').eq('tenant_id', a.userId);
    expect(data ?? []).toHaveLength(0);
  });

  it('an unauthenticated client reads nothing', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await anon.from('chunks').select('*');
    expect(data ?? []).toHaveLength(0);
  });
});
