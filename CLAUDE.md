# AI Coach — Claude Code Project Memory

## What this project is

A plug-and-play multi-tenant RAG platform. Two seeded demo coaches (StrengthLab,
FuelRight). Built with Next.js 15 App Router + Supabase + pgvector + Vercel AI SDK.

Full spec: see `docs/SPEC.md`. Read it before starting any phase.

## Core rules

1. **Spec is the source of truth.** If something in this file or in code
   contradicts the spec, the spec wins. Flag the contradiction.

2. **Phased execution.** Work one phase at a time (phases are in §15 of the
   spec). After each phase, stop and let the candidate review.

3. **Plan before code.** Before implementing a phase, write a plan to
   `docs/plans/phase-N-plan.md` and wait for review.

4. **TypeScript strict.** No `any`. No `as unknown as ...` casts.

5. **Tenant ID is sacred.** Never derive `tenantId` from the request body or
   URL params. Always derive it from the authenticated session inside the
   server function. Repository functions require `tenantId` as an argument
   and add an explicit `where tenant_id = $1` even though RLS is also active.

6. **Server-first.** Prefer Server Components and Server Actions over client
   components. Add `'use client'` only when you actually need interactivity.

7. **Streaming for chat only.** Other routes return JSON.

8. **Run typecheck after every edit.** `pnpm typecheck` must pass before
   declaring a task complete.

## Tech stack (locked)

- Next.js 15 (App Router) + TypeScript strict
- Supabase (Auth + Postgres + Storage) with `@supabase/ssr`
- pgvector for embeddings (HNSW, cosine)
- OpenAI `text-embedding-3-small` for embeddings (1536 dim)
- Anthropic Claude Sonnet as default chat model, OpenAI as fallback (tenant-selectable)
- Vercel AI SDK for streaming
- Inngest for ingestion jobs
- shadcn/ui + Tailwind for UI
- react-hook-form + zod for forms
- pnpm

## What NOT to add without asking

- No Pinecone / Qdrant / Chroma — we use pgvector
- No Cohere rerank — out of scope (mention in next-steps doc only)
- No Helicone / Langfuse — out of scope
- No Redis / Upstash — Postgres-based rate limit only
- No new auth providers — Supabase email/password is it

## Conventions

- File names: kebab-case (`chat-interface.tsx`, not `ChatInterface.tsx`)
- Component names: PascalCase
- Server functions in `lib/` or `app/_actions/`
- Repository functions in `lib/repositories/`
- Repository functions take `(client, tenantId, ...args)` in that order
- All zod schemas live next to the code that uses them
- Database migrations in `supabase/migrations/NNNN_description.sql`

## Commands

- `pnpm dev` — local dev server
- `pnpm typecheck` — run after every edit
- `pnpm lint` — eslint
- `pnpm db:migrate` — apply Supabase migrations
- `pnpm seed` — seed demo tenants and ingest sample content
- `pnpm eval` — run golden questions
- `pnpm test` — run tests including isolation test

## Subagents

- `architect` — for design decisions and ADRs
- `builder` — for focused implementation
- `validator` — for verifying a task against acceptance criteria
- `design-reviewer` — for catching generic AI aesthetics

Definitions in `.claude/agents/`.

## Skills

When relevant, invoke:
- `/postgres-supabase-expert` for migrations and RLS
- `/server-action-builder` for Server Actions
- `/frontend-design` for any UI work

## When stuck

If a task is blocked or the spec is ambiguous, stop and ask the candidate.
Never invent requirements or paper over ambiguity with reasonable-sounding
defaults.
