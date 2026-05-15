// Side-effect module. Import this FIRST in any standalone tsx script
// (before importing the supabase admin client or anything that reads env):
//
//   import './_bootstrap';
//   import { createAdminClient } from '../src/lib/supabase/admin';
//
// 1. Loads .env.local so lazily-read env vars resolve.
// 2. Polyfills global WebSocket — Node 20 has none, and @supabase/supabase-js
//    constructs a RealtimeClient in its constructor which requires one even
//    though scripts never use realtime.

import { config as loadEnv } from 'dotenv';
import ws from 'ws';

loadEnv({ path: '.env.local' });

if (!('WebSocket' in globalThis)) {
  // @ts-expect-error ws is API-compatible with the DOM WebSocket for
  // supabase-realtime's usage; the structural types differ harmlessly.
  globalThis.WebSocket = ws;
}
