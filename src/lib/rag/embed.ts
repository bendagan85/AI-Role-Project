import OpenAI from 'openai';

// text-embedding-3-small returns 1536-dim vectors and costs ~$0.02 per 1M
// tokens — cheap enough that the price isn't a design constraint for us.
const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;

// OpenAI accepts up to 2048 inputs per call but the request body cap and
// memory pressure make ~100 a more comfortable batch size.
const BATCH_SIZE = 100;
const MAX_CONCURRENCY = 3;

let _openai: OpenAI | null = null;
function getClient(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  _openai = new OpenAI({ apiKey });
  return _openai;
}

export const EMBEDDING_DIMENSIONS = DIMENSIONS;

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const client = getClient();
  const resp = await client.embeddings.create({
    model: MODEL,
    input: texts,
  });
  return resp.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/**
 * Embed an array of texts. Internally batches and parallelises with a small
 * concurrency cap to avoid hitting rate limits.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }

  const results: number[][][] = new Array(batches.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= batches.length) return;
      results[idx] = await embedBatch(batches[idx]);
    }
  }

  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENCY, batches.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results.flat();
}
