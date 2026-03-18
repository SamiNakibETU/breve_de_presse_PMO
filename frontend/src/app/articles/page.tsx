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
import { FileText, X } from "lucide-react";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Articles</h1>
          <p className="text-muted-foreground">
            {total} article{total !== 1 ? "s" : ""} disponible
            {total !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_OPTIONS).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-border"
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
        <div className="fixed bottom-0 left-60 right-0 z-20 border-t border-border bg-card p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {selected.size} article{selected.size > 1 ? "s" : ""}{" "}
                sélectionné{selected.size > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={goToReview}
              disabled={selected.size < 1 || selected.size > 10}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              Générer la revue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
