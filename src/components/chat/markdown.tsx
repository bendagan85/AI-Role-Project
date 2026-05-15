'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks: keep them readable on narrow chat bubbles.
          pre: ({ children }) => (
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{children}</pre>
          ),
          code: ({ className, children }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) return <code className={className}>{children}</code>;
            return (
              <code className="bg-muted rounded px-1 py-0.5 text-xs">{children}</code>
            );
          },
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
