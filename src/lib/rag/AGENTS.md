# RAG layer

This folder owns chunking, embedding, retrieval, and prompt composition.

## Rules

- Pure functions where possible. Side effects (DB writes) live in callers.
- Embeddings: always batch (max 100 per call) with concurrency cap of 3.
- Retrieval: always pass tenantId. Never query chunks without it.
- Similarity threshold for low-confidence: 0.3 (cosine). Adjustable via
  tenant config later.
- Chunk size: 800 tokens, 150 overlap. Markdown-aware splitter for .md
  content. Page-aware splitter for PDFs.

## Don't

- Don't call the OpenAI client from anywhere outside `lib/rag/embed.ts`.
- Don't pass raw chunk content to the model without metadata wrapping
  (title at minimum) — the LLM uses titles for citations.
