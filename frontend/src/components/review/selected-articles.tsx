"use client";

import type { Article } from "@/lib/types";
import { X } from "lucide-react";
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
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Aucun article sélectionné. Retournez à la page Articles pour en
        choisir.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {articles.map((a, idx) => (
        <div
          key={a.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {idx + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {a.title_fr || a.title_original}
            </p>
            <p className="text-xs text-muted-foreground">
              {a.media_name} &mdash; {a.country}
            </p>
          </div>
          <ConfidenceBadge score={a.translation_confidence} />
          <button
            onClick={() => onRemove(a.id)}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Retirer ${a.title_fr || a.title_original}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
