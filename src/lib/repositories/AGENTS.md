# Repositories

All database access goes through this folder. No raw Supabase queries
from route handlers or server actions.

## Signature

Every repository function takes `(supabase, tenantId, ...args)` and always
adds `.eq('tenant_id', tenantId)` even though RLS would handle it.

## Don't

- Don't accept `tenantId` from the caller without verifying it was derived
  from the session.
- Don't return raw Supabase errors — wrap them.
