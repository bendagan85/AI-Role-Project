# Seed Content Sources

All markdown files under `seed-data/strengthlab/` and `seed-data/fuelright/` were
written from scratch for this project. They synthesize widely-known, evidence-based
content in strength training and performance nutrition.

**Important:** Nothing here is medical advice. The seeded agents include a disclaimer
in their system prompts to remind end users of this.

If you want to extend a seeded knowledge base, drop more `.md` files into the
relevant tenant folder and re-run `pnpm seed`. The script is idempotent — re-running
it after edits will re-ingest changed files without duplicating chunks.
