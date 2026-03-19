"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";
import {
  ArticleFilters,
  type Filters,
} from "@/components/articles/article-filters";
import { ArticleList } from "@/components/articles/article-list";

const STATUS_OPTIONS: Record<string, { label: string; value: string }> = {
  all_processed: {
    label: "Traduits & formatés",
    value: "translated,formatted,needs_review",
  },
  collected: { label: "Collectés (bruts)", value: "collected" },
  all: {
    label: "Tous",
    value: "collected,translated,formatted,needs_review,error",
  },
};

export default function ArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all_processed");
  const [filters, setFilters] = useState<Filters>({
    countries: [],
    types: [],
    minConfidence: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      status: STATUS_OPTIONS[statusFilter].value,
      limit: "200",
    };
    if (filters.countries.length > 0)
      params.country = filters.countries.join(",");
    if (filters.types.length > 0)
      params.article_type = filters.types.join(",");
    if (filters.minConfidence > 0)
      params.min_confidence = String(filters.minConfidence);

    try {
      const data = await api.articles(params);
      setArticles(data.articles);
      setTotal(data.total);
    } catch {
      setArticles([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToReview() {
    const ids = Array.from(selected);
    sessionStorage.setItem("review_article_ids", JSON.stringify(ids));
    router.push("/review");
  }

  return (
    <div className="mx-auto max-w-[var(--max-width-page)] px-[var(--spacing-page)] pt-12 pb-32">
      <header className="mb-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Index
        </p>
        <h1 className="mt-2 font-serif text-[2rem] font-semibold leading-[1.2] tracking-tight text-foreground">
          Articles
        </h1>
        <p className="mt-1.5 font-mono text-[12px] text-muted-foreground">
          {total} article{total !== 1 ? "s" : ""} disponible{total !== 1 ? "s" : ""}
        </p>
      </header>

      <div className="mb-8 flex items-baseline gap-0 border-b border-border-light/60 pb-1">
        {Object.entries(STATUS_OPTIONS).map(([key, { label }], i) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`font-mono text-[11px] tracking-[0.12em] transition-colors ${
              i > 0 ? "ml-6 pl-6 border-l border-border-light/60" : ""
            } ${
              statusFilter === key
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ArticleFilters filters={filters} onChange={setFilters} />

      <ArticleList
        articles={articles}
        selected={selected}
        onToggle={toggle}
        loading={loading}
      />

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border-light/80 bg-background/98 px-[var(--spacing-page)] py-3">
          <div className="mx-auto flex max-w-[var(--max-width-page)] items-center justify-between">
            <p className="font-mono text-[12px]">
              <span className="font-medium text-foreground">{selected.size}</span>
              <span className="text-muted-foreground"> sélectionné</span>
              <button
                onClick={() => setSelected(new Set())}
                className="ml-3 text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Effacer
              </button>
            </p>
            <button
              onClick={goToReview}
              disabled={selected.size < 1 || selected.size > 10}
              className="font-mono text-[11px] tracking-wider text-foreground underline decoration-accent underline-offset-2 hover:text-accent disabled:opacity-40 disabled:no-underline"
            >
              Générer la revue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
