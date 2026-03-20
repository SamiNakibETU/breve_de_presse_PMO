"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";
import { ArticleFilters, type Filters } from "@/components/articles/article-filters";
import { ArticleList } from "@/components/articles/article-list";
import { saveReviewArticleIds } from "@/lib/review-selection-storage";
import { useReviewArticleSelection } from "@/hooks/use-review-article-selection";

const PAGE_SIZE = 40;

const STATUS_OPTIONS: Record<string, { label: string; value: string }> = {
  editorial: { label: "Éditorial", value: "translated,formatted,needs_review" },
  all_processed: { label: "Tous traduits", value: "translated,formatted,needs_review" },
  needs_review: { label: "À relire", value: "needs_review" },
  dead_letter: {
    label: "Traduction (erreurs)",
    value: "error,translation_abandoned",
  },
  collected: { label: "Bruts", value: "collected" },
  all: {
    label: "Tout",
    value:
      "collected,translated,formatted,needs_review,error,translation_abandoned",
  },
};

const SORT_OPTIONS: Record<string, { label: string; value: string }> = {
  relevance: { label: "Pertinence", value: "relevance" },
  date: { label: "Date (collecte)", value: "date" },
  confidence: { label: "Confiance ↓", value: "confidence" },
  confidence_asc: { label: "Confiance ↑", value: "confidence_asc" },
};

function buildArticleParams(
  statusFilter: string,
  sortBy: string,
  filters: Filters,
  offset: number,
): Record<string, string> {
  const params: Record<string, string> = {
    status: STATUS_OPTIONS[statusFilter].value,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort: sortBy,
    days: "7",
  };
  if (filters.countries.length > 0) params.country = filters.countries.join(",");
  if (filters.types.length > 0) params.article_type = filters.types.join(",");
  if (filters.minConfidence > 0)
    params.min_confidence = String(filters.minConfidence);
  return params;
}

export default function ArticlesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    selectedIds: selected,
    toggleArticle: toggle,
    clearSelection,
    ready: selectionReady,
  } = useReviewArticleSelection();
  const [statusFilter, setStatusFilter] = useState<string>("editorial");
  const [sortBy, setSortBy] = useState<string>("relevance");
  const [filters, setFilters] = useState<Filters>({
    countries: [],
    types: ["opinion", "editorial", "tribune", "analysis"],
    minConfidence: 0.7,
  });
  const [batchBusy, setBatchBusy] = useState(false);

  const queryKey = useMemo(
    () =>
      [
        "articles",
        {
          statusFilter,
          sortBy,
          filters,
        },
      ] as const,
    [statusFilter, sortBy, filters],
  );

  const {
    data,
    isPending,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    error,
  } = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const params = buildArticleParams(
        statusFilter,
        sortBy,
        filters,
        pageParam,
      );
      return api.articles(params);
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((acc, p) => acc + p.articles.length, 0);
      if (loaded >= lastPage.total) return undefined;
      return loaded;
    },
  });

  const articles: Article[] = useMemo(
    () => data?.pages.flatMap((p) => p.articles) ?? [],
    [data],
  );

  const total = data?.pages[0]?.total ?? 0;

  function goToReview() {
    saveReviewArticleIds(selected);
    router.push("/review");
  }

  async function runBatch(
    fn: (ids: string[]) => Promise<{ updated: number }>,
  ) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBatchBusy(true);
    try {
      const r = await fn(ids);
      await queryClient.invalidateQueries({ queryKey: ["articles"] });
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      clearSelection();
      if (typeof window !== "undefined") {
        window.alert(`Mis à jour : ${r.updated} article(s).`);
      }
    } catch (e) {
      if (typeof window !== "undefined") {
        window.alert(
          e instanceof Error ? e.message : "Erreur lors de l’action groupée",
        );
      }
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          Articles
        </h1>
        <p className="mt-0.5 text-[13px] text-[#888]">
          {total} article{total !== 1 ? "s" : ""} · {articles.length} affiché
          {articles.length !== 1 ? "s" : ""}
          {sortBy === "relevance"
            ? " · Tri partiel par pertinence (par page)"
            : ""}
          {statusFilter === "needs_review"
            ? " · Tri confiance / date disponibles ci-dessous"
            : ""}
        </p>
      </header>

      {error && (
        <p className="border-l-2 border-[#c8102e] pl-3 text-[13px] text-[#c8102e]">
          {error instanceof Error ? error.message : "Erreur de chargement"}
        </p>
      )}

      <div className="flex items-center justify-between border-b border-[#dddcda] pb-2">
        <nav className="flex gap-4">
          {Object.entries(STATUS_OPTIONS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`text-[13px] transition-colors ${
                statusFilter === key
                  ? "font-semibold text-[#1a1a1a]"
                  : "text-[#888] hover:text-[#1a1a1a]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex gap-2">
          {Object.entries(SORT_OPTIONS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-[12px] transition-colors ${
                sortBy === key
                  ? "font-semibold text-[#1a1a1a]"
                  : "text-[#888] hover:text-[#1a1a1a]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ArticleFilters filters={filters} onChange={setFilters} />

      <ArticleList
        articles={articles}
        selected={selected}
        onToggle={toggle}
        loading={isPending}
      />

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="border border-[#dddcda] bg-white px-5 py-2 text-[13px] font-medium text-[#1a1a1a] hover:bg-[#f7f7f5] disabled:opacity-50"
          >
            {isFetchingNextPage ? "Chargement…" : "Charger plus d’articles"}
          </button>
        </div>
      )}

      {selectionReady && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#dddcda] bg-white/97 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="font-[family-name:var(--font-serif)] text-[20px] font-semibold tabular-nums">
                {selected.size}
              </span>
              <span className="text-[13px] text-[#888]">
                article{selected.size > 1 ? "s" : ""} sélectionné
                {selected.size > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => clearSelection()}
                className="text-[11px] text-[#888] underline hover:text-[#1a1a1a]"
              >
                Effacer
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {statusFilter === "needs_review" && (
                <button
                  type="button"
                  disabled={batchBusy}
                  onClick={() => void runBatch(api.batchMarkReviewed)}
                  className="border border-[#1a1a1a] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f7f7f5] disabled:opacity-40"
                >
                  Marquer relus (translated)
                </button>
              )}
              {statusFilter === "dead_letter" && (
                <>
                  <button
                    type="button"
                    disabled={batchBusy}
                    onClick={() => void runBatch(api.batchRetryTranslation)}
                    className="border border-[#1a1a1a] bg-white px-3 py-2 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f7f7f5] disabled:opacity-40"
                  >
                    Réessayer traduction
                  </button>
                  <button
                    type="button"
                    disabled={batchBusy}
                    onClick={() => void runBatch(api.batchAbandonTranslation)}
                    className="border border-[#dddcda] px-3 py-2 text-[12px] text-[#666] hover:bg-[#fafaf8] disabled:opacity-40"
                  >
                    Abandonner
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={goToReview}
                disabled={selected.size < 1 || selected.size > 10}
                className="bg-[#c8102e] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#a50d25] disabled:opacity-40"
              >
                Générer la revue ({selected.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
