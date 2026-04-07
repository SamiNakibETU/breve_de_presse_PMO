"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  ArticleFilters,
  ArticleFilterNavLinks,
  type Filters,
} from "@/components/articles/article-filters";
import { ArticleList } from "@/components/articles/article-list";
import { mergeArticlesQuery } from "@/lib/articles-url-query";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { api } from "@/lib/api";
import { shiftIsoDate, todayBeirutIsoDate } from "@/lib/beirut-date";
import {
  formatArticlesExplorationPeriodHint,
  formatEditionDayHeadingFr,
  formatIsoCalendarDayLongFr,
} from "@/lib/dates-display-fr";
import {
  UI_FRISE_CONTROL_ROW,
  UI_SURFACE_FRise_INSET,
  UI_SURFACE_FRISE_SEPARATOR,
} from "@/lib/ui-surface-classes";
import { reviewPagePath } from "@/lib/review-url";
import type { Article } from "@/lib/types";

const PAGE_SIZE = 40;

/** Fenêtre glissante pour la liste (alignée sur le paramètre API `days`). */
const ARTICLES_ROLLING_DAYS: number = 2;

const STATUS_OPTIONS: Record<string, { label: string; value: string }> = {
  editorial: {
    label: "Pour la revue (traduits + à relire)",
    value: "translated,needs_review",
  },
  needs_review: { label: "À relire", value: "needs_review" },
  all: {
    label: "Tous",
    value:
      "collected,translated,formatted,needs_review,error,translation_abandoned",
  },
};

const STATUS_NAV = Object.entries(STATUS_OPTIONS).map(([key, { label }]) => ({
  key,
  label,
}));

function buildArticleParams(
  statusFilter: string,
  sortBy: string,
  filters: Filters,
  offset: number,
  editionId: string | null,
  beirutDate: string | null,
  beirutFrom: string | null,
  beirutTo: string | null,
  dateBasis: "collected" | "published",
): Record<string, string> {
  const params: Record<string, string> = {
    status: STATUS_OPTIONS[statusFilter].value,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sort: sortBy,
  };
  if (filters.countries.length > 0) params.country = filters.countries.join(",");
  if (filters.types.length > 0) params.article_type = filters.types.join(",");
  if (filters.minConfidence > 0)
    params.min_confidence = String(filters.minConfidence);
  if (filters.includeLowQuality) params.include_low_quality = "true";
  if (filters.hideSyndicated) params.hide_syndicated = "true";
  if (filters.groupSyndicated) params.group_syndicated = "true";
  if (editionId) {
    params.edition_id = editionId;
  } else if (beirutFrom && beirutTo) {
    params.beirut_from = beirutFrom;
    params.beirut_to = beirutTo;
    params.date_basis = dateBasis;
  } else if (beirutDate) {
    params.beirut_date = beirutDate;
    params.date_basis = dateBasis;
  } else {
    params.days = String(ARTICLES_ROLLING_DAYS);
  }
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
  countryLabelsFr,
  activeEditionId,
  sortOptions,
}: {
  statusFilter: string;
  sortBy: string;
  setStatusFilter: (k: string) => void;
  setSortBy: (k: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  countsByCountry: Record<string, number> | null;
  countryLabelsFr: Record<string, string> | null;
  activeEditionId: string | null;
  sortOptions: { key: string; label: string }[];
}) {
  return (
    <div className="space-y-6">
      <ArticleFilterNavLinks
        statusFilter={statusFilter}
        sortBy={sortBy}
        onStatusChange={setStatusFilter}
        onSortChange={setSortBy}
        statusOptions={STATUS_NAV}
        sortOptions={sortOptions}
      />
      <ArticleFilters
        filters={filters}
        onChange={setFilters}
        countsByCountry={countsByCountry}
        countryLabelsFr={countryLabelsFr}
        activeEditionId={activeEditionId}
      />
    </div>
  );
}

export function ArticlesPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeEditionId =
    searchParams.get("edition_id")?.trim().replace(/^"|"$/g, "") || null;

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<string>("editorial");
  const [sortBy, setSortBy] = useState<string>("relevance");
  const [filters, setFilters] = useState<Filters>({
    countries: [],
    types: ["opinion", "editorial", "tribune", "analysis"],
    minConfidence: 0,
    includeLowQuality: false,
    hideSyndicated: true,
    groupSyndicated: false,
  });
  const [groupByOljTheme, setGroupByOljTheme] = useState(true);

  const beirutDate = searchParams.get("date")?.trim() || null;
  const beirutFrom = searchParams.get("date_from")?.trim() || null;
  const beirutTo = searchParams.get("date_to")?.trim() || null;
  const dateBasisRaw = searchParams.get("date_basis")?.trim();
  const dateBasis: "collected" | "published" =
    dateBasisRaw === "published" ? "published" : "collected";

  const patchSearch = useCallback(
    (patch: Record<string, string | null | undefined>) => {
      const qs = mergeArticlesQuery(searchParams, patch);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const articlesDayHref = useCallback(
    (iso: string) => {
      const qs = mergeArticlesQuery(searchParams, {
        date: iso,
        date_from: null,
        date_to: null,
      });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const sortNav = useMemo(() => {
    const dateLabel =
      dateBasis === "published"
        ? "Date (parution, repli sur collecte)"
        : "Date (collecte)";
    return [
      { key: "relevance", label: "Pertinence" },
      { key: "date", label: dateLabel },
      { key: "confidence", label: "Qualité de traduction" },
      {
        key: "confidence_asc",
        label: "Qualité de traduction (basse d’abord)",
      },
    ];
  }, [dateBasis]);

  const rangeActive = Boolean(beirutFrom && beirutTo);
  const editionFriseIso = useMemo(() => {
    if (activeEditionId || rangeActive) {
      return null;
    }
    return beirutDate ?? todayBeirutIsoDate();
  }, [activeEditionId, rangeActive, beirutDate]);

  const editionFriseQ = useQuery({
    queryKey: ["edition", editionFriseIso, "articlesFrise"] as const,
    queryFn: () => api.editionByDate(editionFriseIso!),
    enabled: editionFriseIso != null,
    staleTime: 60_000,
    retry: false,
  });

  const oljLabelsQ = useQuery({
    queryKey: ["oljTopicLabels"] as const,
    queryFn: () => api.oljTopicLabels(),
    staleTime: 60 * 60 * 1000,
  });

  const queryKey = useMemo(
    () =>
      [
        "articles",
        {
          statusFilter,
          sortBy,
          filters,
          activeEditionId,
          beirutDate,
          beirutFrom,
          beirutTo,
          dateBasis,
        },
      ] as const,
    [
      statusFilter,
      sortBy,
      filters,
      activeEditionId,
      beirutDate,
      beirutFrom,
      beirutTo,
      dateBasis,
    ],
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
        activeEditionId,
        beirutDate,
        beirutFrom,
        beirutTo,
        dateBasis,
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
  const countryLabelsFr = data?.pages[0]?.country_labels_fr ?? null;

  const toggle = useCallback((articleId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  function goToReview() {
    router.push(reviewPagePath([...selected]));
  }

  const todayIso = todayBeirutIsoDate();
  const articlesFriseWindowOk =
    editionFriseQ.data?.window_start != null &&
    editionFriseQ.data?.window_end != null;
  const showArticlesFriseStrip =
    editionFriseIso != null &&
    (editionFriseQ.isPending || articlesFriseWindowOk);

  const filterColumnProps = {
    statusFilter,
    sortBy,
    setStatusFilter,
    setSortBy,
    filters,
    setFilters,
    countsByCountry,
    countryLabelsFr,
    activeEditionId,
    sortOptions: sortNav,
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

      <aside className="hidden w-[17rem] shrink-0 lg:sticky lg:top-8 lg:block">
        <FiltersColumn {...filterColumnProps} />
      </aside>

      <div className="min-w-0 flex-1 space-y-5 pb-24">
        <header>
          <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold leading-tight sm:text-[24px]">
            Articles
          </h1>
          <p className="mt-1 text-[12px] leading-snug text-foreground-body">
            {activeEditionId ? (
              <>Corpus de l’édition liée (fenêtre Beyrouth côté serveur).</>
            ) : rangeActive ? (
              <>
                Plage calendaire{" "}
                <strong className="font-medium text-foreground">
                  {beirutFrom} → {beirutTo}
                </strong>{" "}
                (<strong className="font-medium text-foreground">Asia/Beirut</strong>
                ), critère :{" "}
                {dateBasis === "published" ? (
                  <span className="font-medium text-foreground">
                    date de parution (repli sur collecte)
                  </span>
                ) : (
                  <span className="font-medium text-foreground">date de collecte</span>
                )}
                .
              </>
            ) : beirutDate ? (
              <>
                Jour calendaire{" "}
                <strong className="font-medium text-foreground">
                  {formatIsoCalendarDayLongFr(beirutDate)}
                </strong>{" "}
                (<strong className="font-medium text-foreground">Asia/Beirut</strong>
                ), critère :{" "}
                {dateBasis === "published" ? (
                  <span className="font-medium text-foreground">
                    parution (repli sur collecte)
                  </span>
                ) : (
                  <span className="font-medium text-foreground">collecte</span>
                )}
                .
              </>
            ) : (
              formatArticlesExplorationPeriodHint(ARTICLES_ROLLING_DAYS)
            )}
          </p>
          {!activeEditionId ? (
            <div className={`mt-4 w-full space-y-4 ${UI_SURFACE_FRise_INSET}`}>
              {rangeActive ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/25 pb-3 text-[11px] text-foreground-body">
                  <span className="tabular-nums">
                    Plage sélectionnée :{" "}
                    <strong className="font-medium text-foreground">
                      {beirutFrom} → {beirutTo}
                    </strong>
                  </span>
                  <button
                    type="button"
                    className="text-accent underline underline-offset-2 hover:opacity-90"
                    onClick={() => patchSearch({ date_from: null, date_to: null })}
                  >
                    Effacer la plage
                  </button>
                </div>
              ) : null}
              {!rangeActive ? (
                <div className={UI_FRISE_CONTROL_ROW}>
                  <Link
                    href={articlesDayHref(shiftIsoDate(editionFriseIso!, -1))}
                    scroll={false}
                    className="olj-date-rail__chevron shrink-0"
                    aria-label={`Jour précédent : ${formatEditionDayHeadingFr(shiftIsoDate(editionFriseIso!, -1))}`}
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Link>
                  <EditionCalendarPopover
                    currentIso={editionFriseIso!}
                    triggerLabel="Calendrier"
                    onDateSelect={(iso) =>
                      patchSearch({
                        date: iso,
                        date_from: null,
                        date_to: null,
                      })
                    }
                  />
                  <Link
                    href={articlesDayHref(shiftIsoDate(editionFriseIso!, 1))}
                    scroll={false}
                    className="olj-date-rail__chevron shrink-0"
                    aria-label={`Jour suivant : ${formatEditionDayHeadingFr(shiftIsoDate(editionFriseIso!, 1))}`}
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  </Link>
                </div>
              ) : null}
              {editionFriseIso ? (
                articlesFriseWindowOk && editionFriseQ.data ? (
                  <div className={UI_SURFACE_FRISE_SEPARATOR}>
                    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      {editionFriseQ.data.corpus_article_count != null ? (
                        <p className="text-[12px] text-muted-foreground">
                          Corpus du sommaire (jour d’édition affiché) :{" "}
                          <span className="font-semibold tabular-nums text-foreground">
                            {editionFriseQ.data.corpus_article_count}
                          </span>{" "}
                          article
                          {editionFriseQ.data.corpus_article_count !== 1 ? "s" : ""}
                        </p>
                      ) : null}
                      <p className="text-[11px] italic leading-snug text-muted-foreground sm:max-w-[55%] sm:text-right">
                        Plage du sommaire (Beyrouth), même repère que sur la page Édition
                      </p>
                    </div>
                    <EditionPeriodFrise
                      windowStartIso={editionFriseQ.data.window_start}
                      windowEndIso={editionFriseQ.data.window_end}
                      publishRouteIso={editionFriseIso}
                      unifiedDayNav={{ mode: "articles", dayRadius: 14 }}
                    />
                  </div>
                ) : editionFriseQ.isPending ? (
                  <div className={UI_SURFACE_FRISE_SEPARATOR}>
                    <div
                      className="h-20 animate-pulse rounded-md bg-[color-mix(in_srgb,var(--color-muted)_22%,transparent)]"
                      aria-hidden
                    />
                  </div>
                ) : null
              ) : null}
              <div
                className={
                  showArticlesFriseStrip
                    ? "space-y-4 border-t border-border/25 pt-4"
                    : "space-y-4"
                }
              >
              <div className="flex flex-wrap items-center gap-3 text-[12px] text-foreground-body">
                <span className="text-muted-foreground">Critère temporel (hors édition)</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="articles-date-basis"
                    className="olj-focus accent-[var(--color-accent)]"
                    checked={dateBasis === "collected"}
                    onChange={() => patchSearch({ date_basis: "collected" })}
                  />
                  Collecte
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="articles-date-basis"
                    className="olj-focus accent-[var(--color-accent)]"
                    checked={dateBasis === "published"}
                    onChange={() => patchSearch({ date_basis: "published" })}
                  />
                  Parution
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground-body">
                <span className="text-muted-foreground">Plage multi-jours (max. 31)</span>
                <EditionCalendarPopover
                  currentIso={beirutFrom ?? todayIso}
                  triggerLabel={beirutFrom ? `Depuis ${beirutFrom}` : "Depuis"}
                  onDateSelect={(iso) => {
                    const existingTo = searchParams.get("date_to")?.trim();
                    patchSearch({
                      date: null,
                      date_from: iso,
                      date_to: existingTo && existingTo >= iso ? existingTo : iso,
                    });
                  }}
                />
                <EditionCalendarPopover
                  currentIso={beirutTo ?? beirutFrom ?? todayIso}
                  triggerLabel={beirutTo ? `Jusqu’au ${beirutTo}` : "Jusqu’au"}
                  onDateSelect={(iso) => {
                    const existingFrom = searchParams.get("date_from")?.trim();
                    patchSearch({
                      date: null,
                      date_to: iso,
                      date_from:
                        existingFrom && existingFrom <= iso ? existingFrom : iso,
                    });
                  }}
                />
                {(beirutDate || rangeActive) && (
                  <button
                    type="button"
                    className="text-accent underline underline-offset-2 hover:opacity-90"
                    onClick={() =>
                      patchSearch({
                        date: null,
                        date_from: null,
                        date_to: null,
                      })
                    }
                  >
                    Période glissante ({ARTICLES_ROLLING_DAYS} j.)
                  </button>
                )}
              </div>
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-[13px] tabular-nums text-muted-foreground">
            {total} article{total !== 1 ? "s" : ""} · {articles.length} affiché
            {articles.length !== 1 ? "s" : ""}
          </p>
          <details className="mt-3 rounded-sm border border-border bg-muted/10 px-3 py-2">
            <summary className="cursor-pointer list-none text-[12px] font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:text-accent">
              Aide : période, édition, filtres et traductions
            </summary>
            <div className="mt-2 space-y-2 border-t border-border/40 pt-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                Le filtre « jour Beyrouth » n’est pas la fenêtre d’édition de la revue (veille 18 h → jour J 6 h). Sur la
                frise, les jours cliquables et la bande horaire reprennent la fenêtre du sommaire pour le jour d’édition
                de référence (aujourd’hui ou le jour choisi), comme sur Panorama et l’édition du jour. Pour le livrable
                rédactionnel :{" "}
                <a href="/panorama" className="font-medium text-accent underline underline-offset-2">
                  Panorama
                </a>{" "}
                ou l’édition datée.
              </p>
              <p>
                Statut et tri : colonne de gauche. Les blocs « Thème · … » suivent la taxonomie OLJ ; décochez le
                groupement pour une grille continue.
              </p>
              <p>
                Traductions (relu, réessayer) :{" "}
                <a href="/regie" className="font-medium text-accent underline underline-offset-2">
                  Régie
                </a>
                .
              </p>
            </div>
          </details>
        </header>

        {error && (
          <p className="olj-alert-destructive px-3 py-2">
            {error instanceof Error ? error.message : "Erreur de chargement"}
          </p>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground-body">
          <input
            type="checkbox"
            className="olj-focus size-[14px] rounded-sm border-border"
            checked={groupByOljTheme}
            onChange={(e) => setGroupByOljTheme(e.target.checked)}
          />
          Grouper par thème OLJ (rubriques de la taxonomie)
        </label>

        <ArticleList
          articles={articles}
          selected={selected}
          onToggle={toggle}
          loading={isPending}
          topicLabelsFr={oljLabelsQ.data?.labels_fr ?? null}
          groupByOljTheme={groupByOljTheme}
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

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/98 shadow-[0_-6px_24px_rgba(27,26,26,0.06)] backdrop-blur-sm">
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
