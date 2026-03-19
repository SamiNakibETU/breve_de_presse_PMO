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
      <div className="border-t border-border-light/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse border-b border-border-light/40"
          />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="border-t border-border-light/60 py-16 font-mono text-center text-[12px] text-muted-foreground">
        Aucun article avec ces critères
      </div>
    );
  }

  return (
    <div className="border-t border-border-light/60">
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
