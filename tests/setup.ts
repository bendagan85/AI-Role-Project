// Node 20 has no native WebSocket. @supabase/supabase-js constructs a
// RealtimeClient in its constructor which needs one, even though our tests
// never use realtime. Polyfill the global before any client is created.
import ws from 'ws';

if (!('WebSocket' in globalThis)) {
  // @ts-expect-error — ws's type isn't structurally identical to the DOM
  // WebSocket, but it's API-compatible for supabase-realtime's usage.
  globalThis.WebSocket = ws;
}
