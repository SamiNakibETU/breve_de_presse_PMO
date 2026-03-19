"use client";

import type { Article } from "@/lib/types";
import { ConfidenceBadge } from "@/components/articles/confidence-badge";

interface SelectedArticlesProps {
  articles: Article[];
  onRemove: (id: string) => void;
}

export function SelectedArticles({ articles, onRemove }: SelectedArticlesProps) {
  if (articles.length === 0) {
    return (
      <p className="border-t border-border py-10 text-center text-[13px] text-muted-foreground">
        Aucun article sélectionné. Retournez à l&rsquo;index pour en choisir.
      </p>
    );
  }

  return (
    <ol className="border-t border-border">
      {articles.map((a, idx) => (
        <li key={a.id} className="flex items-baseline gap-3 border-b border-border-light py-2">
          <span className="w-4 flex-shrink-0 text-right tabular-nums text-[12px] font-semibold text-muted-foreground">
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-snug">{a.title_fr || a.title_original}</p>
            <p className="text-[11px] text-muted-foreground">
              {a.media_name} · {a.country}
            </p>
          </div>
          <ConfidenceBadge score={a.translation_confidence} />
          <button
            onClick={() => onRemove(a.id)}
            className="text-[11px] text-muted-foreground hover:text-accent"
            aria-label={`Retirer ${a.title_fr || a.title_original}`}
          >
            ✕
          </button>
        </li>
      ))}
    </ol>
  );
}
