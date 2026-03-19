"use client";

import type { Article } from "@/lib/types";
import { ConfidenceBadge } from "@/components/articles/confidence-badge";

interface SelectedArticlesProps {
  articles: Article[];
  onRemove: (id: string) => void;
}

export function SelectedArticles({
  articles,
  onRemove,
}: SelectedArticlesProps) {
  if (articles.length === 0) {
    return (
      <div className="mt-3 py-12 font-mono text-[12px] text-muted-foreground">
        Aucun article sélectionné. Retournez à l&rsquo;index.
      </div>
    );
  }

  return (
    <ol className="mt-3 space-y-0 border-t border-border-light/50 pt-2">
      {articles.map((a, idx) => (
        <li
          key={a.id}
          className="flex items-baseline gap-4 border-b border-border-light/40 py-2.5"
        >
          <span className="w-4 flex-shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium leading-snug text-foreground">
              {a.title_fr || a.title_original}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {a.media_name} — {a.country}
            </p>
          </div>
          <ConfidenceBadge score={a.translation_confidence} />
          <button
            onClick={() => onRemove(a.id)}
            className="font-mono text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            aria-label={`Retirer ${a.title_fr || a.title_original}`}
          >
            retirer
          </button>
        </li>
      ))}
    </ol>
  );
}
