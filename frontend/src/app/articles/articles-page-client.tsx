"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  ArticleFilters,
  ArticleFilterNavLinks,
  ArticlesMobileFilterRow,
  type Filters,
} from "@/components/articles/article-filters";
import { ArticleList } from "@/components/articles/article-list";
import { SelectionActionDock } from "@/components/layout/selection-action-dock";
import { mergeArticlesQuery } from "@/lib/articles-url-query";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { api } from "@/lib/api";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import {
  formatArticlesExplorationPeriodHint,
  formatIsoCalendarDayLongFr,
} from "@/lib/dates-display-fr";
import {
  UI_SURFACE_FRise_INSET,
} from "@/lib/ui-surface-classes";
import { reviewPagePath } from "@/lib/review-url";
import type { Article, SemanticSearchHit } from "@/lib/types";

const PAGE_SIZE = 40;

/** Fenêtre glissante pour la liste (alignée sur le paramètre API `days`). */
const ARTICLES_ROLLING_DAYS: number = 2;

const STATUS_OPTIONS: Record<string, { label: string; value: string }> = {
  editorial: {
    label: "Revue",
    value: "translated,formatted,needs_review",
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
  sortOptions: { key: string; label: string; title?: string }[];
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
  const [semanticQuery, setSemanticQuery] = useState("");
  const [semanticHits, setSemanticHits] = useState<SemanticSearchHit[] | null>(null);
  const [semanticQueryCommitted, setSemanticQueryCommitted] = useState("");

  const semanticMutation = useMutation({
    mutationFn: (q: string) =>
      api.semanticArticleSearch({
        query: q.trim(),
        limit: 20,
        hours: 336,
        country_codes: filters.countries.length ? filters.countries : undefined,
        article_types: filters.types.length ? filters.types : undefined,
      }),
    onSuccess: (res, q) => {
      setSemanticHits(res.hits);
      setSemanticQueryCommitted(q.trim());
    },
    onError: () => {
      setSemanticHits(null);
    },
  });

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

  const sortNav = useMemo(() => {
    const dateTitle =
      dateBasis === "published"
        ? "Parution (repli sur collecte si besoin)"
        : "Heure de collecte";
    return [
      { key: "relevance", label: "Pertinence", title: undefined as string | undefined },
      { key: "date", label: "Date", title: dateTitle },
      { key: "confidence", label: "Qualité ↓", title: "Meilleure traduction d’abord" },
      { key: "confidence_asc", label: "Qualité ↑", title: "Traduction la moins sûre d’abord" },
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

  const semanticIds = useMemo(
    () =>
      semanticHits && semanticHits.length > 0
        ? semanticHits.map((h) => h.article_id)
        : null,
    [semanticHits],
  );

  const semanticArticlesQ = useQuery({
    queryKey: ["articlesByIdsSemantic", (semanticIds ?? []).join(",")] as const,
    queryFn: () => api.articlesByIds(semanticIds!),
    enabled: Boolean(semanticIds && semanticIds.length > 0),
    staleTime: 30_000,
  });

  const semanticArticlesOrdered = useMemo((): Article[] => {
    const rows = semanticArticlesQ.data?.articles;
    if (!rows?.length || !semanticIds) return [];
    const byId = new Map(rows.map((a) => [a.id, a]));
    return semanticIds.map((id) => byId.get(id)).filter((a): a is Article => Boolean(a));
  }, [semanticArticlesQ.data?.articles, semanticIds]);

  const semanticListActive = Boolean(semanticIds && semanticIds.length > 0);
  const listArticles = semanticListActive ? semanticArticlesOrdered : articles;
  const listLoading = semanticListActive ? semanticArticlesQ.isPending : isPending;

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
      <aside className="order-2 hidden w-[17rem] shrink-0 lg:sticky lg:top-8 lg:order-1 lg:block">
        <FiltersColumn {...filterColumnProps} />
      </aside>

      <div className="order-1 min-w-0 flex-1 space-y-5 pb-36 lg:order-2">
        <details className="group rounded-xl border border-border/60 bg-card p-3 lg:hidden">
          <summary className="cursor-pointer list-none text-[12px] font-semibold text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
            Filtres et tri
          </summary>
          <div className="mt-3 border-t border-border/40 pt-3">
            <FiltersColumn {...filterColumnProps} />
          </div>
        </details>

        <header>
          <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold leading-tight sm:text-[24px]">
            Articles
          </h1>
          <p className="mt-1 text-[12px] leading-snug text-foreground-body">
            {activeEditionId ? (
              <>Édition liée · filtre serveur (Beyrouth).</>
            ) : rangeActive ? (
              <>
                {beirutFrom} → {beirutTo} · Beyrouth ·{" "}
                {dateBasis === "published" ? "parution" : "collecte"}
              </>
            ) : beirutDate ? (
              <>
                {formatIsoCalendarDayLongFr(beirutDate)} · Beyrouth ·{" "}
                {dateBasis === "published" ? "parution" : "collecte"}
              </>
            ) : (
              formatArticlesExplorationPeriodHint(ARTICLES_ROLLING_DAYS)
            )}
          </p>
          {!activeEditionId ? (
            <div className={`mt-4 w-full space-y-4 ${UI_SURFACE_FRise_INSET}`}>
              {rangeActive ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/25 pb-3 text-[11px] text-foreground-body">
                  <span className="tabular-nums text-muted-foreground">
                    {beirutFrom} → {beirutTo}
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
              {editionFriseIso && !rangeActive ? (
                editionFriseQ.data ? (
                  <div>
                    {editionFriseQ.data.corpus_article_count != null ? (
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        Sommaire ·{" "}
                        <span className="font-semibold tabular-nums text-foreground">
                          {editionFriseQ.data.corpus_article_count}
                        </span>{" "}
                        article{editionFriseQ.data.corpus_article_count !== 1 ? "s" : ""}
                      </p>
                    ) : null}
                    <EditionPeriodFrise
                      currentIso={editionFriseIso}
                      editionWindow={{
                        start: editionFriseQ.data.window_start,
                        end: editionFriseQ.data.window_end,
                      }}
                      unifiedDayNav={(iso) =>
                        patchSearch({
                          date: iso,
                          date_from: null,
                          date_to: null,
                        })
                      }
                    />
                  </div>
                ) : editionFriseQ.isPending ? (
                  <div
                    className="h-20 animate-pulse rounded-md bg-[color-mix(in_srgb,var(--color-muted)_22%,transparent)]"
                    aria-hidden
                  />
                ) : null
              ) : null}
              <div
                className={
                  showArticlesFriseStrip
                    ? "space-y-4 border-t border-border/25 pt-4"
                    : "space-y-4"
                }
              >
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Base</span>
                <div className="inline-flex rounded-lg border border-border/60 bg-muted/10 p-0.5">
                  <button
                    type="button"
                    onClick={() => patchSearch({ date_basis: "collected" })}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all [transition-duration:var(--duration-fast)] ${dateBasis === "collected" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Collecte
                  </button>
                  <button
                    type="button"
                    onClick={() => patchSearch({ date_basis: "published" })}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all [transition-duration:var(--duration-fast)] ${dateBasis === "published" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    Parution
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-foreground-body">
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Plage</span>
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
                    onClick={() =>
                      patchSearch({
                        date: null,
                        date_from: null,
                        date_to: null,
                      })
                    }
                    className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
                  >
                    Glissant ({ARTICLES_ROLLING_DAYS} j.)
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

        <section
          className="rounded-xl border border-border/55 bg-muted/10 px-3 py-3 sm:px-4"
          aria-label="Recherche sémantique"
        >
          <p className="text-[11px] font-semibold text-foreground">Recherche sémantique</p>
          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
            Par proximité vectorielle sur les articles récents (serveur pgvector + Cohere). Les filtres pays
            / types ci-dessus sont repris si vous les avez définis.
          </p>
          <form
            className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              const q = semanticQuery.trim();
              if (q.length < 2) return;
              semanticMutation.mutate(q);
            }}
          >
            <input
              type="search"
              value={semanticQuery}
              onChange={(e) => setSemanticQuery(e.target.value)}
              placeholder="Ex. : tensions commerciales Chine, médias arabes…"
              className="olj-focus min-h-[2.5rem] w-full flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60"
              minLength={2}
              aria-label="Requête en langage naturel"
            />
            <button
              type="submit"
              disabled={semanticMutation.isPending || semanticQuery.trim().length < 2}
              className="olj-btn-secondary shrink-0 px-4 py-2 text-[12px] disabled:opacity-45"
            >
              {semanticMutation.isPending ? "Recherche…" : "Chercher"}
            </button>
          </form>
          {semanticMutation.isError && (
            <p className="mt-2 text-[11px] text-accent" role="alert">
              {semanticMutation.error instanceof Error
                ? semanticMutation.error.message
                : "Recherche indisponible (clé API, pgvector ou périmètre)."}
            </p>
          )}
          {semanticHits && semanticHits.length === 0 && !semanticMutation.isPending ? (
            <p className="mt-2 text-[11px] text-muted-foreground">Aucun résultat proche.</p>
          ) : null}
        </section>

        {error && (
          <p className="olj-alert-destructive px-3 py-2">
            {error instanceof Error ? error.message : "Erreur de chargement"}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <ArticlesMobileFilterRow
            statusFilter={statusFilter}
            sortBy={sortBy}
            onStatusChange={setStatusFilter}
            onSortChange={setSortBy}
            statusOptions={STATUS_NAV}
            sortOptions={sortNav}
          />
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground-body lg:ml-auto">
            <input
              type="checkbox"
              className="olj-focus size-[14px] rounded-sm border-border"
              checked={groupByOljTheme}
              onChange={(e) => setGroupByOljTheme(e.target.checked)}
            />
            Grouper par thème OLJ
          </label>
        </div>

        {semanticListActive ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-[12px] text-foreground-body">
            <p className="min-w-0 flex-1 leading-snug">
              <span className="font-semibold text-foreground">Recherche</span> — « {semanticQueryCommitted} » ·{" "}
              {semanticArticlesOrdered.length} résultat{semanticArticlesOrdered.length !== 1 ? "s" : ""}
            </p>
            <button
              type="button"
              className="shrink-0 rounded-md border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent/30 hover:text-foreground"
              onClick={() => {
                setSemanticHits(null);
                setSemanticQueryCommitted("");
              }}
            >
              Revenir à la liste
            </button>
          </div>
        ) : null}

        <ArticleList
          articles={listArticles}
          selected={selected}
          onToggle={toggle}
          loading={listLoading}
          topicLabelsFr={oljLabelsQ.data?.labels_fr ?? null}
          groupByOljTheme={groupByOljTheme}
        />

        {hasNextPage && !semanticListActive && (
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

      <SelectionActionDock
        selectionCount={selected.size}
        onClear={clearSelection}
        primaryLabel={`Générer la revue (${selected.size})`}
        onPrimary={() => goToReview()}
        primaryDisabled={selected.size < 1 || selected.size > 10}
      />
    </div>
  );
}
