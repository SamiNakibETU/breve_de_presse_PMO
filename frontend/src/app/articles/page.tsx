"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";
import { ArticleFilters, type Filters } from "@/components/articles/article-filters";
import { ArticleList } from "@/components/articles/article-list";

const STATUS_OPTIONS: Record<string, { label: string; value: string }> = {
  editorial: { label: "Éditorial", value: "translated,formatted,needs_review" },
  all_processed: { label: "Tous traduits", value: "translated,formatted,needs_review" },
  collected: { label: "Bruts", value: "collected" },
  all: { label: "Tout", value: "collected,translated,formatted,needs_review,error" },
};

export default function ArticlesPage() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("editorial");
  const [filters, setFilters] = useState<Filters>({
    countries: [],
    types: ["opinion", "editorial", "tribune", "analysis"],
    minConfidence: 0.7,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = {
      status: STATUS_OPTIONS[statusFilter].value,
      limit: "200",
    };
    if (filters.countries.length > 0) params.country = filters.countries.join(",");
    if (filters.types.length > 0) params.article_type = filters.types.join(",");
    if (filters.minConfidence > 0) params.min_confidence = String(filters.minConfidence);

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

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function goToReview() {
    sessionStorage.setItem("review_article_ids", JSON.stringify(Array.from(selected)));
    router.push("/review");
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">Articles</h1>
        <p className="mt-0.5 text-[13px] text-[#888]">
          {total} article{total !== 1 ? "s" : ""} · Sélectionnez pour la revue
        </p>
      </header>

      <nav className="flex gap-4 border-b border-[#dddcda] pb-2">
        {Object.entries(STATUS_OPTIONS).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`text-[13px] transition-colors ${
              statusFilter === key ? "font-semibold text-[#1a1a1a]" : "text-[#888] hover:text-[#1a1a1a]"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <ArticleFilters filters={filters} onChange={setFilters} />

      <ArticleList articles={articles} selected={selected} onToggle={toggle} loading={loading} />

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#dddcda] bg-white/97 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-serif)] text-[20px] font-semibold tabular-nums">{selected.size}</span>
              <span className="text-[13px] text-[#888]">
                article{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
              </span>
              <button onClick={() => setSelected(new Set())} className="text-[11px] text-[#888] underline hover:text-[#1a1a1a]">
                Effacer
              </button>
            </div>
            <button
              onClick={goToReview}
              disabled={selected.size < 1 || selected.size > 10}
              className="bg-[#c8102e] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#a50d25] disabled:opacity-40"
            >
              Générer la revue ({selected.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
