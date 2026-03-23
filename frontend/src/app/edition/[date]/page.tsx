"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArticleRow } from "@/components/composition/ArticleRow";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { EditionClusterFallback } from "@/components/edition/edition-cluster-fallback";
import { TopicSection } from "@/components/edition/TopicSection";
import { ReviewPreview } from "@/components/review/review-preview";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import { api } from "@/lib/api";
import type {
  Article,
  Edition,
  EditionDetectionStatus,
  EditionTopic,
} from "@/lib/types";

const QUERY_STALE_MS = 5 * 60 * 1000;
const TOPIC_SUMMARY_PREVIEWS = 6;

function formatDateFr(iso: string): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function detectionLabel(s: EditionDetectionStatus | undefined): string | null {
  switch (s) {
    case "done":
      return null;
    case "running":
      return "Organisation des sujets en cours…";
    case "failed":
      return "L’organisation automatique n’est pas disponible pour cette édition.";
    default:
      return "Les grands sujets peuvent être calculés après collecte et traduction, ou via le bouton ci-dessous.";
  }
}

function EditionSommaireSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true" aria-label="Chargement">
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-muted/50" />
        <div className="h-9 w-72 max-w-full rounded bg-muted/60" />
        <div className="h-4 w-full max-w-xl rounded bg-muted/35" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-3 border-b border-border pb-6">
            <div className="h-5 w-4/5 rounded bg-muted/50" />
            <div className="h-3 w-full rounded bg-muted/30" />
            <div className="h-3 w-11/12 rounded bg-muted/25" />
            <div className="mt-4 h-16 rounded bg-muted/20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CorpusListSkeleton() {
  return (
    <div className="space-y-0 animate-pulse" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="border-b border-border-light py-4"
        >
          <div className="h-4 w-3/4 rounded bg-muted/40" />
          <div className="mt-2 h-3 w-full rounded bg-muted/25" />
        </div>
      ))}
    </div>
  );
}

export default function EditionSommairePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const qc = useQueryClient();
  const pipeline = usePipelineRunnerOptional();

  const statsQ = useQuery({
    queryKey: ["stats"] as const,
    queryFn: () => api.stats(),
    staleTime: QUERY_STALE_MS,
  });

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
    staleTime: QUERY_STALE_MS,
  });

  const editionId = editionQ.data?.id;
  const detectionStatus: EditionDetectionStatus =
    editionQ.data?.detection_status ?? "pending";

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "summary", TOPIC_SUMMARY_PREVIEWS] as const,
    queryFn: () =>
      api.editionTopics(editionId!, {
        includeArticlePreviews: true,
        maxArticlePreviewsPerTopic: TOPIC_SUMMARY_PREVIEWS,
      }),
    enabled: Boolean(editionId),
    staleTime: QUERY_STALE_MS,
  });

  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
    staleTime: QUERY_STALE_MS,
  });

  const statusQ = useQuery({
    queryKey: ["status"] as const,
    queryFn: () => api.status(),
    staleTime: QUERY_STALE_MS,
  });

  const topics = topicsQ.data ?? [];
  const hasTopicFeed =
    detectionStatus === "done" && topics.length > 0;

  const clustersFallbackQ = useQuery({
    queryKey: ["editionClustersFallback", editionId] as const,
    queryFn: () => api.editionClustersFallback(editionId!),
    enabled:
      Boolean(editionId) &&
      !hasTopicFeed &&
      detectionStatus !== "running",
    staleTime: QUERY_STALE_MS,
  });

  const [panelList, setPanelList] = useState(false);
  const [panelSearch, setPanelSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const showCorpus = !hasTopicFeed || panelList || panelSearch;

  const articlesListQ = useQuery({
    queryKey: [
      "editionArticlesList",
      date,
      debouncedQ,
      showCorpus,
      panelSearch,
    ] as const,
    queryFn: () =>
      api.articles({
        sort: "relevance",
        limit: "250",
        days: "14",
        group_syndicated: "true",
        ...(panelSearch && debouncedQ ? { q: debouncedQ } : {}),
      }),
    enabled: Boolean(date) && showCorpus,
    staleTime: 60_000,
  });

  const listArticles: Article[] = articlesListQ.data?.articles ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [genOpen, setGenOpen] = useState(false);
  const [generatedText, setGeneratedText] = useState("");

  useEffect(() => {
    if (!editionId) {
      return;
    }
    const raw = localStorage.getItem(`olj-edition-selection-${editionId}`);
    if (!raw) {
      return;
    }
    try {
      const arr = JSON.parse(raw) as unknown;
      if (Array.isArray(arr)) {
        setSelectedIds(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch {
      /* ignore */
    }
  }, [editionId]);

  useEffect(() => {
    if (!editionId) {
      return;
    }
    localStorage.setItem(
      `olj-edition-selection-${editionId}`,
      JSON.stringify([...selectedIds]),
    );
  }, [editionId, selectedIds]);

  const idToCountryCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topics) {
      for (const p of t.article_previews ?? []) {
        if (p.country_code) {
          m.set(p.id, p.country_code);
        }
      }
    }
    for (const a of listArticles) {
      m.set(a.id, a.country_code);
    }
    return m;
  }, [topics, listArticles]);

  const selectedCountryCodes = useMemo(() => {
    const s = new Set<string>();
    for (const id of selectedIds) {
      const c = idToCountryCode.get(id);
      if (c) {
        s.add(c.toUpperCase());
      }
    }
    return [...s];
  }, [selectedIds, idToCountryCode]);

  const edition = editionQ.data ?? null;

  const stats = useMemo(() => {
    if (topics.length > 0) {
      let ac = 0;
      const cc = new Set<string>();
      for (const t of topics) {
        ac += t.article_count ?? t.article_previews?.length ?? 0;
        for (const c of t.countries ?? []) {
          cc.add(c);
        }
      }
      return { articles: ac, countries: cc.size, developments: topics.length };
    }
    const total = edition?.corpus_article_count ?? 0;
    const countries = edition?.corpus_country_count ?? 0;
    return {
      articles: total,
      countries,
      developments: 0,
    };
  }, [topics, edition]);

  const collectHint =
    statsQ.data != null
      ? `${statsQ.data.total_collected_24h.toLocaleString("fr-FR")} article(s) collecté(s) sur les dernières 24 h`
      : null;

  const pipelineJobsHint = useMemo(() => {
    const jobs = statusQ.data?.jobs ?? [];
    if (jobs.length === 0) return null;
    return jobs
      .map((j) => `${j.name} : ${j.next_run ?? "non planifié"}`)
      .join(" · ");
  }, [statusQ.data?.jobs]);

  const toggleArticle = useCallback((id: string, next: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (next) {
        n.add(id);
      } else {
        n.delete(id);
      }
      return n;
    });
  }, []);

  const detectMutation = useMutation({
    mutationFn: () => api.editionDetectTopics(editionId!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["edition", date] });
      await qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
      await qc.invalidateQueries({
        queryKey: ["editionClustersFallback", editionId],
      });
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => api.generateReview([...selectedIds]),
    onSuccess: (data) => {
      setGeneratedText(data.full_text);
      setGenOpen(true);
    },
  });

  const loading =
    editionQ.isPending || (Boolean(editionId) && topicsQ.isPending);
  const detectionMessage = detectionLabel(detectionStatus);
  const err =
    editionQ.error?.message ??
    topicsQ.error?.message ??
    articlesListQ.error?.message ??
    null;

  const showDetectCta =
    Boolean(editionId) &&
    detectionStatus !== "running" &&
    (detectionStatus === "pending" ||
      detectionStatus === "failed" ||
      (detectionStatus === "done" && topics.length === 0));

  const fallbackRows = clustersFallbackQ.data ?? [];
  const showClusterFallback =
    !hasTopicFeed &&
    detectionStatus !== "running" &&
    fallbackRows.length > 0;

  const corpusEmpty =
    !loading &&
    showCorpus &&
    !articlesListQ.isPending &&
    listArticles.length === 0;

  return (
    <div className="space-y-10 pb-36">
      <header className="max-w-3xl">
        <p className="olj-rubric">Édition du jour</p>
        <h1 className="mt-3 font-[family-name:var(--font-serif)] text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground capitalize sm:text-[32px]">
          {date ? formatDateFr(date) : "Date non renseignée"}
        </h1>
        {edition && (
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            <span className="tabular-nums">{stats.articles}</span>{" "}
            article{stats.articles > 1 ? "s" : ""}{" "}
            {stats.articles > 1 ? "disponibles" : "disponible"},{" "}
            <span className="tabular-nums">{stats.countries}</span> pays
            représentés
            {stats.developments > 0 ? (
              <>
                ,{" "}
                <span className="tabular-nums">{stats.developments}</span>{" "}
                grand{stats.developments > 1 ? "s" : ""} sujet
                {stats.developments > 1 ? "s" : ""}
              </>
            ) : null}
            {collectHint ? (
              <>
                {" "}
                · {collectHint}
              </>
            ) : null}
          </p>
        )}
        {detectionMessage ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {detectionMessage}
          </p>
        ) : null}
      </header>

      {err && (
        <p
          className="border-l border-destructive pl-3 text-[13px] text-destructive"
          role="alert"
          aria-live="polite"
        >
          {err}
        </p>
      )}

      {showDetectCta && (
        <aside
          className="border-l border-accent bg-surface/60 py-3 pl-4 pr-2 text-[13px] leading-relaxed text-foreground-body"
          role="status"
        >
          <p className="font-[family-name:var(--font-serif)] text-[15px] font-medium text-foreground">
            {detectionStatus === "failed"
              ? "Détection des sujets indisponible"
              : "Organiser le corpus par grands sujets"}
          </p>
          <p className="mt-1.5 text-muted-foreground">
            {detectionStatus === "failed"
              ? "La liste par pertinence reste utilisable pour composer la revue."
              : "Lancez la détection automatique pour regrouper les textes par développement du jour et par regards contrastés."}
          </p>
          <button
            type="button"
            className="olj-link-action mt-3 disabled:opacity-45"
            disabled={!editionId || detectMutation.isPending}
            onClick={() => detectMutation.mutate()}
          >
            {detectMutation.isPending
              ? "Analyse en cours…"
              : "Détecter les sujets"}
          </button>
        </aside>
      )}

      {loading && <EditionSommaireSkeleton />}

      {!loading && hasTopicFeed && (
        <>
          <div>
            <h2 className="olj-rubric olj-rule mb-4">Grands sujets</h2>
            <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
              {topics.map((t: EditionTopic) => (
                <TopicSection
                  key={t.id}
                  topic={t}
                  selectedIds={selectedIds}
                  onToggleArticle={toggleArticle}
                  editionDate={date}
                  mode="summary"
                />
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
              <button
                type="button"
                className={
                  panelList
                    ? "font-medium text-foreground underline decoration-accent underline-offset-4"
                    : "underline decoration-border underline-offset-4 hover:text-foreground"
                }
                onClick={() => {
                  setPanelList((v) => !v);
                  if (!panelList) setPanelSearch(false);
                }}
              >
                {panelList ? "Masquer la liste complète" : "Liste complète"}
              </button>
              <button
                type="button"
                className={
                  panelSearch
                    ? "font-medium text-foreground underline decoration-accent underline-offset-4"
                    : "underline decoration-border underline-offset-4 hover:text-foreground"
                }
                onClick={() => {
                  setPanelSearch((v) => !v);
                  if (!panelSearch) setPanelList(false);
                }}
              >
                {panelSearch
                  ? "Fermer la recherche"
                  : "Rechercher dans le corpus"}
              </button>
            </div>
          </div>

          {panelSearch && (
            <div className="max-w-xl pt-4">
              <label className="olj-rubric mb-1 block" htmlFor="edition-search-q">
                Recherche
              </label>
              <input
                id="edition-search-q"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Titre, résumé, thèse, angle…"
                className="olj-field-search"
                autoComplete="off"
              />
            </div>
          )}
        </>
      )}

      {!loading && !hasTopicFeed && (
        <div className="max-w-xl space-y-4">
          <p className="text-[13px] leading-relaxed text-foreground-body">
            Aucun grand sujet éditorial pour cette date pour l’instant. Vous
            pouvez lancer le traitement complet depuis l’en-tête (collecte,
            traduction, regroupement), ou utiliser le regroupement automatique
            ci-dessous s’il est disponible.
          </p>
          {pipeline ? (
            <button
              type="button"
              className="olj-btn-secondary text-[12px] disabled:opacity-45"
              disabled={pipeline.running !== null}
              onClick={() =>
                pipeline.startRun("pipeline", "Traitement complet")
              }
            >
              {pipeline.running?.key === "pipeline"
                ? "Traitement…"
                : "Lancer le traitement complet"}
            </button>
          ) : null}
          {pipelineJobsHint ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Tâches planifiées (UTC) · {pipelineJobsHint}
            </p>
          ) : null}
          <div>
            <label className="olj-rubric mb-1 block" htmlFor="edition-search-q-empty">
              Rechercher dans le corpus
            </label>
            <input
              id="edition-search-q-empty"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Titre, résumé, thèse…"
              className="olj-field-search"
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {!loading &&
        clustersFallbackQ.isFetching &&
        !hasTopicFeed &&
        detectionStatus !== "running" && (
          <p className="text-[12px] text-muted-foreground">
            Chargement des regroupements automatiques…
          </p>
        )}

      {!loading && showClusterFallback && (
        <EditionClusterFallback rows={fallbackRows} />
      )}

      {!loading && showCorpus && (
        <section className="space-y-0 border-t border-border pt-8">
          <h2 className="olj-rubric olj-rule mb-6">
            {panelSearch && debouncedQ
              ? "Résultats de recherche"
              : "Corpus, pertinence éditoriale"}
          </h2>
          {articlesListQ.isPending && <CorpusListSkeleton />}
          {corpusEmpty && (
            <p className="text-[13px] text-muted-foreground">
              Aucun article dans cette vue. Lancez le traitement complet ou
              élargissez la recherche.
            </p>
          )}
          {!articlesListQ.isPending &&
            listArticles.map((a) => (
              <ArticleRow
                key={a.id}
                article={a}
                selected={selectedIds.has(a.id)}
                onSelectedChange={(next) => toggleArticle(a.id, next)}
              />
            ))}
        </section>
      )}

      {genOpen && generatedText && (
        <section className="border-t border-border bg-surface/30 py-8">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="olj-rubric">Brouillon pour le CMS</h2>
            <button
              type="button"
              className="text-[12px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              onClick={() => setGenOpen(false)}
            >
              Masquer
            </button>
          </div>
          <ReviewPreview text={generatedText} stickyToolbar />
        </section>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="pointer-events-auto mx-auto max-w-[80rem] border-t border-border bg-background px-5 py-3 sm:px-6">
          <CoverageGaps
            selectedCountryCodes={selectedCountryCodes}
            targets={coverageQ.data ?? null}
            compact
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <p className="text-center text-[12px] text-muted-foreground sm:text-right">
              <span className="tabular-nums font-medium text-foreground">
                {selectedIds.size}
              </span>{" "}
              sélection
            </p>
            <button
              type="button"
              className="olj-btn-primary w-full sm:w-auto"
              disabled={selectedIds.size === 0 || generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending
                ? "Rédaction…"
                : "Générer la revue"}
            </button>
          </div>
          {generateMutation.isError && (
            <p
              className="mt-2 border-l border-destructive pl-3 text-[12px] text-destructive"
              role="alert"
            >
              {(generateMutation.error as Error)?.message ??
                "Échec de la génération"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
