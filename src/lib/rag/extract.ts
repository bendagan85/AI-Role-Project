import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export type ExtractedDoc = {
  title: string;
  text: string;
};

const MAX_URL_BYTES = 10 * 1024 * 1024; // 10 MB safety cap for URL fetches

/**
 * Extract clean text from a PDF buffer using pdf-parse.
 */
export async function extractPdf(buf: ArrayBuffer): Promise<string> {
  // pdf-parse is CommonJS; import dynamically to keep tree-shaking happy.
  const mod = (await import('pdf-parse')) as unknown as
    | { default: (b: Buffer) => Promise<{ text: string }> }
    | ((b: Buffer) => Promise<{ text: string }>);
  const fn = typeof mod === 'function' ? mod : mod.default;
  const result = await fn(Buffer.from(buf));
  return result.text;
}

/**
 * Extract text from a DOCX (Word) buffer using mammoth.
 */
export async function extractDocx(buf: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return result.value;
}

/**
 * Fetch a URL, run Readability on the HTML, return title + cleaned text.
 */
export async function extractUrl(url: string): Promise<ExtractedDoc> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      // Many sites refuse default fetch UAs.
      'user-agent':
        'Mozilla/5.0 (compatible; AI-Coach-Ingester/1.0; +https://github.com/) Chrome/120',
    },
  });
  if (!res.ok) {
    throw new Error(`URL fetch failed: ${res.status} ${res.statusText}`);
  }
  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > MAX_URL_BYTES) {
    throw new Error(`URL response too large (${contentLength} bytes)`);
  }
  const html = await res.text();
  if (html.length > MAX_URL_BYTES) {
    throw new Error('URL response too large after read');
  }

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.textContent || article.textContent.trim().length < 50) {
    // Fallback: dump body text. Better than nothing.
    const bodyText = dom.window.document.body?.textContent?.trim() ?? '';
    if (bodyText.length < 50) {
      throw new Error('Could not extract meaningful text from URL');
    }
    return { title: dom.window.document.title || url, text: bodyText };
  }
  return {
    title: article.title?.trim() || dom.window.document.title || url,
    text: article.textContent.trim(),
  };
}

/**
 * Pick an extractor based on MIME type / filename.
 */
export function pickExtractor(
  filename: string,
  mime: string | null,
): 'pdf' | 'docx' | 'plain' {
  const name = filename.toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    return 'docx';
  }
  // Markdown and plain text both go through plain
  return 'plain';
}
