import { Badge } from '@/components/ui/badge';
import type { Citation } from '@/lib/rag/retrieve';

export function CitationChips({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      <span className="text-muted-foreground text-xs">Sources:</span>
      {citations.map((c) => {
        const label = `${c.title}${c.chunkIndexes.length > 1 ? ` (×${c.chunkIndexes.length})` : ''}`;
        if (c.sourceType === 'url' && c.sourceUrl) {
          return (
            <a
              key={c.documentId}
              href={c.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:no-underline"
            >
              <Badge variant="secondary" className="cursor-pointer hover:underline">
                {label}
              </Badge>
            </a>
          );
        }
        return (
          <Badge key={c.documentId} variant="secondary">
            {label}
          </Badge>
        );
      })}
    </div>
  );
}
