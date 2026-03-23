"use client";

import type { ReactNode } from "react";
import type { Article } from "@/lib/types";
import { ArticleCard } from "./article-card";

/** Clé stable pour regrouper les articles consécutifs par rattachement sujet OLJ. */
function oljTopicGroupKey(a: Article): string | null {
  const ids = a.olj_topic_ids;
  if (!ids || ids.length === 0) return null;
  return [...ids].sort().join(",");
}

function groupSeparatorLabel(upcomingKey: string | null): string {
  if (upcomingKey) {
    const short =
      upcomingKey.length > 14
        ? `${upcomingKey.slice(0, 14)}…`
        : upcomingKey;
    return `Sujet OLJ · ${short}`;
  }
  return "Autres articles";
}

interface ArticleListProps {
  articles: Article[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
}

export function ArticleList({ articles, selected, onToggle, loading }: ArticleListProps) {
  if (loading) {
    return (
      <div className="border-t border-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse border-b border-border-light bg-muted/40" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="border-t border-border py-16 text-center text-[13px] text-muted-foreground">
        Aucun article avec ces critères.
      </div>
    );
  }

  const cells: ReactNode[] = [];
  articles.forEach((a, i) => {
    const curr = oljTopicGroupKey(a);
    const prev = i > 0 ? oljTopicGroupKey(articles[i - 1]!) : null;
    if (i > 0 && curr !== prev) {
      cells.push(
        <div
          key={`sep-${a.id}-${i}`}
          className="col-span-2 border-t border-border-light pt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
        >
          {groupSeparatorLabel(curr)}
        </div>,
      );
    }
    cells.push(
      <div
        key={a.id}
          className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5"
      >
        <ArticleCard
          article={a}
          selected={selected.has(a.id)}
          onToggle={onToggle}
          variant="grid"
        />
      </div>,
    );
  });

  return (
    <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
      {cells}
    </div>
  );
}
