import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS.
 *
 * USE ONLY in trusted server contexts where the tenantId is known to be
 * correct (e.g. inside Inngest workers that consume events dispatched by
 * authenticated server code). Never expose this client or its key to the
 * browser, and never derive tenantId from user-controlled input here.
 *
 * The repository functions still take a tenantId and apply explicit eq()
 * filters — same belt-and-suspenders pattern as the user-scoped client.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin client',
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
