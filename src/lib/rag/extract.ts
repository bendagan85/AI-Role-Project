import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export type ExtractedDoc = {
  title: string;
  text: string;
};

const MAX_URL_BYTES = 10 * 1024 * 1024; // 10 MB safety cap for URL fetches
const FETCH_TIMEOUT_MS = 15_000;

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
 * Validate a user-supplied URL: must be http(s) and must not point at a
 * private / loopback / link-local address (basic SSRF guard — this is a
 * public app and a reviewer may paste anything).
 */
function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Not a valid URL: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme "${u.protocol}" — use http or https`);
  }
  const host = u.hostname.toLowerCase();
  const isPrivate =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) {
    throw new Error('Refusing to fetch a private or loopback address');
  }
  return u;
}

/**
 * Fetch a URL, run Readability on the HTML, return title + cleaned text.
 * Throws a human-readable Error on every failure path so the message
 * surfaces in the document's error_message and tells the coach whether
 * Re-ingest can help or they should paste the text instead.
 */
export async function extractUrl(url: string): Promise<ExtractedDoc> {
  const target = assertSafeUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Many sites refuse default fetch UAs.
        'user-agent':
          'Mozilla/5.0 (compatible; AI-Coach-Ingester/1.0; +https://github.com/) Chrome/120',
        accept: 'text/html,application/xhtml+xml,text/plain',
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`URL fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw new Error(
      `Could not reach the URL: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      throw new Error(
        `The site blocked automated access (HTTP ${res.status}). Paste the content instead.`,
      );
    }
    throw new Error(`URL fetch failed: ${res.status} ${res.statusText}`);
  }

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (contentType && !/text\/html|application\/xhtml|text\/plain/.test(contentType)) {
    throw new Error(
      `Unsupported content type "${contentType.split(';')[0]}" — link to an HTML article, or upload the file directly`,
    );
  }

  const contentLength = Number(res.headers.get('content-length') ?? '0');
  if (contentLength > MAX_URL_BYTES) {
    throw new Error(`URL response too large (${contentLength} bytes)`);
  }
  const html = await res.text();
  if (html.length > MAX_URL_BYTES) {
    throw new Error('URL response too large after read');
  }

  const dom = new JSDOM(html, { url: target.href });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.textContent || article.textContent.trim().length < 50) {
    // Fallback: dump body text. Better than nothing.
    const bodyText = dom.window.document.body?.textContent?.trim() ?? '';
    if (bodyText.length < 50) {
      throw new Error(
        'Could not extract readable text from the page (it may be JavaScript-rendered). Paste the content instead.',
      );
    }
    return { title: dom.window.document.title || target.href, text: bodyText };
  }
  return {
    title: article.title?.trim() || dom.window.document.title || target.href,
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
