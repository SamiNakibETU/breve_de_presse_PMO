"use client";

import type { Article } from "@/lib/types";
import { ArticleCard } from "./article-card";

interface ArticleListProps {
  articles: Article[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
}

export function ArticleList({
  articles,
  selected,
  onToggle,
  loading,
}: ArticleListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-border bg-muted"
          />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Aucun article disponible avec ces filtres. Lancez la collecte ou
        ajustez les critères.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {articles.map((a) => (
        <ArticleCard
          key={a.id}
          article={a}
          selected={selected.has(a.id)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
