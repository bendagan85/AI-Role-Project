# Chat API

Streaming endpoint. Composes context, calls the LLM, persists the result.

## Rules

- Auth via `supabase.auth.getUser()`. Throw 401 if no user.
- Rate limit check before retrieval — see `lib/ratelimit.ts`.
- Persist user message before streaming starts (so a disconnected stream
  still saves the user's message).
- Persist assistant message inside `onFinish` callback.
- Citations are derived from retrieval results, not from the model output.
