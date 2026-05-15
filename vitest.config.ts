import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

// Tests hit the real Supabase project (integration tests for RLS), so we
// load .env.local and give generous timeouts for network round-trips.
loadEnv({ path: '.env.local' });

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
