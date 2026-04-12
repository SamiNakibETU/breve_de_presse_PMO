"use client";

import { useMemo, type ReactNode } from "react";
import type { Article } from "@/lib/types";
import {
  oljTopicGroupKey,
  oljTopicGroupSeparatorLabel,
} from "@/lib/olj-topic-group";
import { ArticleCard } from "./article-card";

interface ArticleListProps {
  articles: Article[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
  /** Libellés FR depuis la taxonomie (API). */
  topicLabelsFr?: Record<string, string> | null;
  /** Faux = grille continue sans séparateurs par combinaison d’ids. */
  groupByOljTheme?: boolean;
}

export function ArticleList({
  articles,
  selected,
  onToggle,
  loading,
  topicLabelsFr = null,
  groupByOljTheme = true,
}: ArticleListProps) {
  const sortedArticles = useMemo(() => {
    if (!groupByOljTheme) return articles;
    return articles
      .map((a, i) => ({ a, i }))
      .sort((x, y) => {
        const ka = oljTopicGroupKey(x.a) ?? "\uffff";
        const kb = oljTopicGroupKey(y.a) ?? "\uffff";
        const c = ka.localeCompare(kb, "fr");
        return c !== 0 ? c : x.i - y.i;
      })
      .map(({ a }) => a);
  }, [articles, groupByOljTheme]);

  if (loading) {
    return (
      <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card p-4 sm:p-5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            {/* Skeleton image */}
            <div className="mb-3 h-32 w-full animate-pulse rounded-lg bg-muted/50" />
            {/* Skeleton type label */}
            <div className="mb-2 h-2.5 w-20 animate-pulse rounded bg-muted/60" />
            {/* Skeleton title */}
            <div className="mb-1.5 h-4 w-full animate-pulse rounded bg-muted/50" />
            <div className="mb-3 h-4 w-3/4 animate-pulse rounded bg-muted/40" />
            {/* Skeleton thesis */}
            <div className="mb-1 h-3 w-full animate-pulse rounded bg-muted/30" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-muted/30" />
            {/* Skeleton meta */}
            <div className="mt-3 h-2.5 w-2/3 animate-pulse rounded bg-muted/25" />
          </div>
        ))}
      </div>
    );
  }

  if (sortedArticles.length === 0) {
    return (
      <div className="border-t border-border py-16 text-center text-[13px] text-muted-foreground">
        Aucun article avec ces critères.
      </div>
    );
  }

  const cardWrap = (a: Article) => (
    <ArticleCard
      key={a.id}
      article={a}
      selected={selected.has(a.id)}
      onToggle={onToggle}
      variant="grid"
      topicLabelsFr={topicLabelsFr}
    />
  );

  if (!groupByOljTheme) {
    return (
      <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
        {sortedArticles.map((a) => cardWrap(a))}
      </div>
    );
  }

  const cells: ReactNode[] = [];
  sortedArticles.forEach((a, i) => {
    const curr = oljTopicGroupKey(a);
    const prev = i > 0 ? oljTopicGroupKey(sortedArticles[i - 1]!) : null;
    if (i > 0 && curr !== prev) {
      cells.push(
        <div
          key={`sep-${a.id}-${i}`}
          className="col-span-2 border-t border-border-light pt-4"
        >
          <p className="max-w-4xl text-[12px] font-semibold leading-snug text-foreground-body">
            {oljTopicGroupSeparatorLabel(curr, topicLabelsFr)}
          </p>
        </div>,
      );
    }
    cells.push(cardWrap(a));
  });

  return (
    <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
      {cells}
    </div>
  );
}
