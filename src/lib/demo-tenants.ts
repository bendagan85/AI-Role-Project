import { createAdminClient } from '@/lib/supabase/admin';
import { getTenant, type Tenant } from '@/lib/repositories/tenant-repo';

export type ListedCoach = {
  tenantId: string;
  email: string;
  tenant: Tenant;
  docCount: number;
};

/**
 * Coaches that appear in the public landing directory: any tenant who has
 * at least one document with status='ready'. This catches the seeded demos
 * (Marcus + Nina) as well as any real coach who has actually uploaded
 * content.
 *
 * Note: for production you'd want a `is_listed` toggle on the coach so
 * they opt in to being publicly listed. For this take-home, "has any
 * indexed content" is the filter.
 */
export async function fetchListableCoaches(): Promise<ListedCoach[]> {
  try {
    const admin = createAdminClient();

    // 1. Find tenant_ids that have at least one ready document.
    const { data: docRows, error: docErr } = await admin
      .from('documents')
      .select('tenant_id')
      .eq('status', 'ready');
    if (docErr || !docRows) return [];

    const counts = new Map<string, number>();
    for (const r of docRows) {
      counts.set(r.tenant_id, (counts.get(r.tenant_id) ?? 0) + 1);
    }
    if (counts.size === 0) return [];

    // 2. Pull the email + tenant row for each listable tenant.
    const tenantIds = Array.from(counts.keys());
    const { data: users, error: userErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (userErr || !users?.users) return [];
    const emailById = new Map<string, string>();
    for (const u of users.users) {
      if (u.email) emailById.set(u.id, u.email);
    }

    const results = await Promise.all(
      tenantIds.map(async (tenantId) => {
        const tenant = await getTenant(admin, tenantId);
        const email = emailById.get(tenantId);
        if (!tenant || !email) return null;
        return {
          tenantId,
          email,
          tenant,
          docCount: counts.get(tenantId) ?? 0,
        };
      }),
    );
    return results.filter((x): x is ListedCoach => x !== null);
  } catch (err) {
    console.error('[fetchListableCoaches] failed:', err);
    return [];
  }
}

// Backwards-compat: existing call sites import `fetchDemoTenants`.
// The new shape is a superset of the old (extra `docCount` field).
export const fetchDemoTenants = fetchListableCoaches;
export type DemoTenant = ListedCoach;
