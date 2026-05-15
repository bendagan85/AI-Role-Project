// Character-based recursive splitter. We target ~800 OpenAI tokens per chunk
// with ~150 tokens of overlap. English averages ~4 characters per token, so:
//   ~800 tokens  ≈ 3200 chars
//   ~150 tokens  ≈  600 chars
// Accurate enough for retrieval; we'd swap to tiktoken if we needed exact counts.

const TARGET_CHARS = 3200;
const OVERLAP_CHARS = 600;
const MIN_SPLIT_AT = TARGET_CHARS / 2; // don't break absurdly early

export type Chunk = {
  index: number;
  content: string;
  approxTokenCount: number;
};

function normalize(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Find the latest "good" break point at or before `end`. Prefer paragraph
 * boundaries, then sentence endings, then any whitespace.
 */
function findBreakPoint(text: string, start: number, end: number): number {
  // Look back from `end` for the best boundary, but not earlier than start + MIN_SPLIT_AT.
  const floor = Math.max(start + MIN_SPLIT_AT, 0);
  const candidates = [
    text.lastIndexOf('\n\n', end),
    text.lastIndexOf('. ', end),
    text.lastIndexOf('! ', end),
    text.lastIndexOf('? ', end),
    text.lastIndexOf('\n', end),
    text.lastIndexOf(' ', end),
  ];
  const best = Math.max(...candidates);
  if (best >= floor) return best + 1;
  return end; // hard cut — better than infinite loop
}

export function chunkText(input: string): Chunk[] {
  const text = normalize(input);
  if (text.length === 0) return [];

  if (text.length <= TARGET_CHARS) {
    return [{ index: 0, content: text, approxTokenCount: Math.ceil(text.length / 4) }];
  }

  const chunks: Chunk[] = [];
  let pos = 0;
  let chunkIndex = 0;

  while (pos < text.length) {
    const nominalEnd = Math.min(pos + TARGET_CHARS, text.length);
    const end = nominalEnd >= text.length ? text.length : findBreakPoint(text, pos, nominalEnd);

    const slice = text.slice(pos, end).trim();
    if (slice.length > 0) {
      chunks.push({
        index: chunkIndex,
        content: slice,
        approxTokenCount: Math.ceil(slice.length / 4),
      });
      chunkIndex += 1;
    }

    if (end >= text.length) break;

    // Step forward with overlap. Make sure we always move forward (avoid loops).
    const nextPos = Math.max(end - OVERLAP_CHARS, pos + 1);
    pos = nextPos;
  }

  return chunks;
}
