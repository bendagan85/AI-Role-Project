# AI Coach — Engineering conventions

## What this project is

A plug-and-play multi-tenant RAG platform. Two seeded demo coaches
(StrengthLab — training, FuelRight — nutrition). Built with Next.js 16
App Router + Supabase + pgvector + Vercel AI SDK.

Architecture, decisions and trade-offs: see `README.md` and
`docs/DESIGN.md`.

## Core rules

1. **README / DESIGN are the source of truth.** If this file or the code
   contradicts them, they win — flag the contradiction.

2. **Incremental execution.** Implement in small, self-contained steps;
   verify each before moving on.

3. **Plan before code.** Outline the approach before implementing a
   non-trivial change.

4. **TypeScript strict.** No `any`. No `as unknown as ...` casts.

5. **Tenant ID is sacred.** Never derive `tenantId` from the request body
   or URL params. Always derive it from the authenticated session inside
   the server function. Repository functions require `tenantId` as an
   argument and add an explicit `where tenant_id = $1` even though RLS is
   also active.

6. **Server-first.** Prefer Server Components and Server Actions over
   client components. Add `'use client'` only when interactivity is needed.

7. **Streaming for chat only.** Other routes return JSON.

8. **Typecheck after every edit.** `pnpm typecheck` must pass before a
   task is considered complete.

## Tech stack (locked)

- Next.js 16 (App Router) + TypeScript strict
- Supabase (Auth + Postgres + Storage) with `@supabase/ssr`
- pgvector for embeddings (HNSW, cosine)
- OpenAI `text-embedding-3-small` for embeddings (1536 dim)
- Anthropic Claude Sonnet default chat model, OpenAI fallback
  (tenant-selectable); Claude Haiku for the category/relevance classifier
- Vercel AI SDK for streaming
- Inngest for ingestion jobs
- shadcn/ui + Tailwind v4 for UI
- react-hook-form + zod for forms
- pnpm

## What NOT to add without asking

- No Pinecone / Qdrant / Chroma — we use pgvector
- No Cohere rerank — out of scope (next-steps only)
- No Helicone / Langfuse — out of scope
- No Redis / Upstash — in-memory rate limit only
- No new auth providers — Supabase email/password is it

## Conventions

- File names: kebab-case (`chat-interface.tsx`, not `ChatInterface.tsx`)
- Component names: PascalCase
- Server functions in `lib/` or `app/_actions/`
- Repository functions in `lib/repositories/`
- Repository functions take `(client, tenantId, ...args)` in that order
- All zod schemas live next to the code that uses them
- Database migrations in `supabase/migrations/NNNN_description.sql`
  (combined into `supabase/schema.sql` for one-paste setup)

## Commands

- `pnpm dev` — local dev server
- `pnpm typecheck` — run after every edit
- `pnpm lint` — eslint
- `pnpm seed` — seed demo tenants and ingest sample content
- `pnpm eval` — run golden questions
- `pnpm test` — tests including the cross-tenant isolation test

DB setup: `npx supabase start` (local, migrations auto-applied) or paste
`supabase/schema.sql` into a hosted Supabase SQL editor — see README.

## Subagents

Definitions in `.claude/agents/`:

- `architect` — design decisions and ADRs
- `builder` — focused implementation
- `validator` — verifying a task against acceptance criteria
- `design-reviewer` — catching generic AI aesthetics

## When stuck

If a task is blocked or a requirement is ambiguous, stop and ask rather
than inventing requirements or papering over ambiguity with
reasonable-sounding defaults.
