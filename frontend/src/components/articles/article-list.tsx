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

/** Libellé lisible pour un id technique absent du map (ex. mena.geopolitics). */
function humanizeTopicId(id: string): string {
  const t = id.trim();
  if (!t) return "";
  return t
    .replace(/[._]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function groupSeparatorLabel(
  upcomingKey: string | null,
  labelsFr: Record<string, string> | null | undefined,
): string {
  if (!upcomingKey) {
    return "Sans thème OLJ assigné";
  }
  const parts = upcomingKey.split(",").map((raw) => {
    const id = raw.trim();
    if (!id) return "";
    const mapped = labelsFr?.[id]?.trim();
    return mapped || humanizeTopicId(id);
  });
  const joined = parts.filter(Boolean).join(" · ");
  return joined ? `Thème · ${joined}` : "Thème · (non renseigné)";
}

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
  if (loading) {
    return (
      <div className="border-t border-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse border-b border-border-light bg-muted/40"
          />
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

  const cardWrap = (a: Article) => (
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
    </div>
  );

  if (!groupByOljTheme) {
    return (
      <div className="grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
        {articles.map((a) => cardWrap(a))}
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
          className="col-span-2 border-t border-border-light pt-4"
        >
          <p className="max-w-4xl text-[12px] font-semibold leading-snug text-foreground-body">
            {groupSeparatorLabel(curr, topicLabelsFr)}
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
