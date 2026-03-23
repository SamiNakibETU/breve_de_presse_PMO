"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArticleFilters,
  ArticleFilterNavLinks,
  type Filters,
} from "@/components/articles/article-filters";
import { ArticleList } from "@/components/articles/article-list";
import { useReviewArticleSelection } from "@/hooks/use-review-article-selection";
import { api } from "@/lib/api";
import { saveReviewArticleIds } from "@/lib/review-selection-storage";
import type { Article } from "@/lib/types";

const PAGE_SIZE = 40;

/** Fenêtre glissante pour la liste (alignée sur le paramètre API `days`). */
const ARTICLES_ROLLING_DAYS: number = 2;

const STATUS_OPTIONS: Record<string, { label: string; value: string }> = {
  editorial: { label: "Éditorial", value: "translated,formatted,needs_review" },
  needs_review: { label: "À relire", value: "needs_review" },
  all: {
    label: "Tous",
    value:
      "collected,translated,formatted,needs_review,error,translation_abandoned",
  },
};

const SORT_OPTIONS: Record<string, { label: string; value: string }> = {
  relevance: { label: "Pertinence", value: "relevance" },
  date: { label: "Date de collecte", value: "date" },
  confidence: { label: "Confiance (haute d’abord)", value: "confidence" },
  confidence_asc: { label: "Confiance (basse d’abord)", value: "confidence_asc" },
};

const STATUS_NAV = Object.entries(STATUS_OPTIONS).map(([key, { label }]) => ({
  key,
  label,
}));

const SORT_NAV = Object.entries(SORT_OPTIONS).map(([key, { label }]) => ({
  key,
  label,
}));

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
    days: String(ARTICLES_ROLLING_DAYS),
  };
  if (filters.countries.length > 0) params.country = filters.countries.join(",");
  if (filters.types.length > 0) params.article_type = filters.types.join(",");
  if (filters.minConfidence > 0)
    params.min_confidence = String(filters.minConfidence);
  if (filters.includeLowQuality) params.include_low_quality = "true";
  if (filters.hideSyndicated) params.hide_syndicated = "true";
  if (filters.groupSyndicated) params.group_syndicated = "true";
  return params;
}

function FiltersColumn({
  statusFilter,
  sortBy,
  setStatusFilter,
  setSortBy,
  filters,
  setFilters,
  countsByCountry,
}: {
  statusFilter: string;
  sortBy: string;
  setStatusFilter: (k: string) => void;
  setSortBy: (k: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  countsByCountry: Record<string, number> | null;
}) {
  return (
    <div className="space-y-6">
      <ArticleFilterNavLinks
        statusFilter={statusFilter}
        sortBy={sortBy}
        onStatusChange={setStatusFilter}
        onSortChange={setSortBy}
        statusOptions={STATUS_NAV}
        sortOptions={SORT_NAV}
      />
      <ArticleFilters
        filters={filters}
        onChange={setFilters}
        countsByCountry={countsByCountry}
      />
    </div>
  );
}

export default function ArticlesPage() {
  const router = useRouter();
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
    includeLowQuality: false,
    hideSyndicated: true,
    groupSyndicated: false,
  });

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
  const countsByCountry = data?.pages[0]?.counts_by_country ?? null;

  function goToReview() {
    saveReviewArticleIds(selected);
    router.push("/review");
  }

  const filterColumnProps = {
    statusFilter,
    sortBy,
    setStatusFilter,
    setSortBy,
    filters,
    setFilters,
    countsByCountry,
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
      <details className="group border border-border-light bg-card p-4 lg:hidden">
        <summary className="olj-rubric cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
          Filtres et tri
        </summary>
        <div className="mt-4">
          <FiltersColumn {...filterColumnProps} />
        </div>
      </details>

      <aside className="hidden w-[15rem] shrink-0 lg:sticky lg:top-8 lg:block">
        <FiltersColumn {...filterColumnProps} />
      </aside>

      <div className="min-w-0 flex-1 space-y-5 pb-24">
        <header>
          <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
            Articles
          </h1>
          <p className="mt-1 text-[12px] leading-snug text-foreground-body">
            {ARTICLES_ROLLING_DAYS === 1
              ? "Période : le dernier jour (glissant, UTC)."
              : `Période : les ${ARTICLES_ROLLING_DAYS} derniers jours (glissant, UTC).`}{" "}
            Vue d’exploration, pas la fenêtre d’édition du jour.
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {total} article{total !== 1 ? "s" : ""} · {articles.length} affiché
            {articles.length !== 1 ? "s" : ""}
            {sortBy === "relevance"
              ? " · tri partiel par pertinence (par page)"
              : ""}
          </p>
        </header>

        <p className="text-[12px] text-muted-foreground">
          Traductions (relu, réessayer) :{" "}
          <a
            href="/regie"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Régie
          </a>
          .
        </p>

        {error && (
          <p className="border-l border-destructive pl-3 text-[13px] text-destructive">
            {error instanceof Error ? error.message : "Erreur de chargement"}
          </p>
        )}

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
              className="olj-btn-secondary px-5 py-2 text-[13px] disabled:opacity-50"
            >
              {isFetchingNextPage ? "Chargement…" : "Charger plus d’articles"}
            </button>
          </div>
        )}
      </div>

      {selectionReady && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95">
          <div className="mx-auto flex max-w-[80rem] flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="font-[family-name:var(--font-serif)] text-[20px] font-semibold tabular-nums text-foreground">
                {selected.size}
              </span>
              <span className="text-[13px] text-muted-foreground">
                article{selected.size > 1 ? "s" : ""} sélectionné
                {selected.size > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={() => clearSelection()}
                className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Effacer
              </button>
            </div>
            <button
              type="button"
              onClick={goToReview}
              disabled={selected.size < 1 || selected.size > 10}
              className="olj-btn-primary disabled:opacity-40"
            >
              Générer la revue ({selected.size})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
