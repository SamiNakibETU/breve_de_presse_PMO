"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import { ArticleRow } from "@/components/composition/ArticleRow";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { EditionThemesView } from "@/components/edition/edition-themes-view";
import { TopicSection } from "@/components/edition/TopicSection";
import { ReviewPreview } from "@/components/review/review-preview";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import { clusterFallbackDisplayTitle } from "@/lib/cluster-display";
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

function formatEditionWindowBeirut(isoStart: string, isoEnd: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Beirut",
  };
  const fmt = new Intl.DateTimeFormat("fr-FR", opts);
  return `Du ${fmt.format(new Date(isoStart))} au ${fmt.format(new Date(isoEnd))} · heure de Beyrouth`;
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
      return null;
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
      <div className="space-y-6">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-3 border-b border-border pb-6">
            <div className="h-5 w-4/5 rounded bg-muted/50" />
            <div className="h-3 w-full rounded bg-muted/30" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="h-24 rounded bg-muted/20" />
              <div className="h-24 rounded bg-muted/25" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CorpusListSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-2" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="rounded border border-border-light p-4">
          <div className="h-3 w-1/2 rounded bg-muted/40" />
          <div className="mt-2 h-4 w-full rounded bg-muted/35" />
          <div className="mt-2 h-3 w-11/12 rounded bg-muted/25" />
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
  const hasTopicFeed = detectionStatus === "done" && topics.length > 0;

  const clustersFallbackQ = useQuery({
    queryKey: ["editionClustersFallback", editionId] as const,
    queryFn: () => api.editionClustersFallback(editionId!),
    enabled: Boolean(editionId) && detectionStatus !== "running",
    staleTime: QUERY_STALE_MS,
  });

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const articlesListQ = useQuery({
    queryKey: ["editionArticlesList", editionId, debouncedQ, "unified"] as const,
    queryFn: () =>
      api.articles({
        edition_id: editionId!,
        sort: "relevance",
        limit: "250",
        group_syndicated: "true",
        ...(debouncedQ ? { q: debouncedQ } : {}),
      }),
    enabled: Boolean(date) && Boolean(editionId),
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

  const clusterRows = clustersFallbackQ.data ?? [];

  const articleAttachmentLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topics) {
      const title = t.title_final ?? t.title_proposed;
      for (const p of t.article_previews ?? []) {
        m.set(p.id, `Sujet : ${title}`);
      }
    }
    for (const row of clusterRows) {
      const lab = clusterFallbackDisplayTitle(row);
      for (const ar of row.articles) {
        if (!m.has(ar.id)) {
          m.set(ar.id, `Thème : ${lab}`);
        }
      }
    }
    return m;
  }, [topics, clusterRows]);

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
    for (const row of clusterRows) {
      for (const ar of row.articles) {
        const c = ar.country_code?.trim();
        if (c) {
          m.set(ar.id, c.toUpperCase());
        }
      }
    }
    return m;
  }, [topics, listArticles, clusterRows]);

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
        for (const p of t.article_previews ?? []) {
          const c = (p.country_code ?? "").trim().toUpperCase();
          if (c) cc.add(c);
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

  const vigieGlobaleHint =
    statsQ.data != null
      ? `Vigie globale : ${statsQ.data.total_collected_24h.toLocaleString("fr-FR")} article(s) entrés en base sur les dernières 24 h (UTC), toutes éditions confondues.`
      : null;

  const editionWindowLabel = useMemo(() => {
    if (!edition?.window_start || !edition?.window_end) return null;
    return formatEditionWindowBeirut(edition.window_start, edition.window_end);
  }, [edition?.window_start, edition?.window_end]);

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
      await qc.invalidateQueries({ queryKey: ["editionArticlesList"] });
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

  const corpusEmpty =
    !loading &&
    !articlesListQ.isPending &&
    listArticles.length === 0 &&
    Boolean(editionId);

  const fullyEmpty =
    !loading &&
    Boolean(edition) &&
    (edition?.corpus_article_count ?? 0) === 0 &&
    clusterRows.length === 0 &&
    !hasTopicFeed;

  const labelsFr = coverageQ.data?.labels_fr ?? null;

  return (
    <div className="space-y-10 pb-36">
      <header className="max-w-3xl">
        <p className="olj-rubric">Édition du jour</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-[family-name:var(--font-serif)] text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground capitalize sm:text-[32px]">
            {date ? formatDateFr(date) : "Date non renseignée"}
          </h1>
          {pipeline && (
            <button
              type="button"
              className="olj-btn-secondary shrink-0 text-[11px] disabled:opacity-45"
              disabled={pipeline.running !== null}
              onClick={() =>
                pipeline.startRun("pipeline", "Traitement complet")
              }
            >
              {pipeline.running?.key === "pipeline"
                ? "Traitement…"
                : "Actualiser"}
            </button>
          )}
        </div>
        {edition && (
          <>
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
              {editionWindowLabel ? (
                <>
                  {" "}
                  · fenêtre d’édition ci-dessous.
                </>
              ) : null}
            </p>
            {editionWindowLabel ? (
              <p className="mt-1.5 text-[12px] leading-snug text-foreground-body">
                {editionWindowLabel}
              </p>
            ) : null}
            {vigieGlobaleHint ? (
              <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                {vigieGlobaleHint}
              </p>
            ) : null}
          </>
        )}
        {detectionMessage ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {detectionMessage}
          </p>
        ) : null}
        {editionId &&
          detectionStatus !== "running" &&
          (detectionStatus === "pending" ||
            detectionStatus === "failed" ||
            (detectionStatus === "done" && topics.length === 0)) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="olj-link-action text-[12px] disabled:opacity-45"
                disabled={detectMutation.isPending}
                onClick={() => detectMutation.mutate()}
              >
                {detectMutation.isPending
                  ? "Analyse en cours…"
                  : "Détecter les grands sujets"}
              </button>
            </div>
          )}
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

      {loading && <EditionSommaireSkeleton />}

      {!loading && (
        <>
          {fullyEmpty && (
            <div className="mt-6 rounded border border-border bg-surface/50 px-5 py-8 sm:px-8">
              <h2 className="font-[family-name:var(--font-serif)] text-[18px] font-semibold text-foreground">
                Aucun article collecté pour cette date
              </h2>
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-foreground-body">
                Lancez le traitement complet (collecte, traduction,
                regroupement) pour alimenter l’édition.
              </p>
              {pipeline ? (
                <button
                  type="button"
                  className="olj-btn-primary mt-5 text-[13px] disabled:opacity-45"
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
                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                  Tâches planifiées (UTC) · {pipelineJobsHint}
                </p>
              ) : null}
            </div>
          )}

          {!fullyEmpty && (
            <div className="mt-6 space-y-14">
              {hasTopicFeed ? (
                <section>
                  <h2 className="olj-rubric olj-rule mb-6">Grands sujets</h2>
                  <div className="space-y-10">
                    {topics.map((t: EditionTopic) => (
                      <TopicSection
                        key={t.id}
                        topic={t}
                        selectedIds={selectedIds}
                        onToggleArticle={toggleArticle}
                        editionDate={date}
                        mode="summary"
                        countryLabelsFr={labelsFr}
                      />
                    ))}
                  </div>
                </section>
              ) : (
                <section className="max-w-xl space-y-4">
                  <p className="text-[13px] leading-relaxed text-foreground-body">
                    Aucun grand sujet éditorial pour cette date. Les
                    regroupements thématiques ci-dessous restent disponibles.
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
                </section>
              )}

              {clusterRows.length > 0 && (
                <section>
                  <h2 className="olj-rubric olj-rule mb-4">
                    Autres regroupements
                  </h2>
                  <EditionThemesView
                    rows={clusterRows}
                    selectedIds={selectedIds}
                    onToggleArticle={toggleArticle}
                    isLoading={
                      clustersFallbackQ.isFetching && clusterRows.length === 0
                    }
                    countryLabelsFr={labelsFr}
                    embedded
                  />
                </section>
              )}

              <section className="border-t border-border pt-10">
                <div className="olj-rubric olj-rule mb-4">
                  <h2 className="mb-1 font-[family-name:var(--font-serif)] text-[15px] font-semibold tracking-wide">
                    {debouncedQ
                      ? "Résultats de recherche"
                      : "Corpus de l’édition"}
                  </h2>
                  {editionWindowLabel ? (
                    <p className="max-w-2xl text-[12px] font-normal normal-case tracking-normal text-muted-foreground">
                      {debouncedQ
                        ? `Filtrés dans la même fenêtre · ${editionWindowLabel}`
                        : `Textes de la fenêtre · ${editionWindowLabel}`}
                    </p>
                  ) : null}
                </div>
                <div className="max-w-xl pb-4">
                  <label
                    className="olj-rubric mb-1 block"
                    htmlFor="edition-search-corpus"
                  >
                    Recherche dans le corpus
                  </label>
                  <input
                    id="edition-search-corpus"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Titre, résumé, thèse, angle…"
                    className="olj-field-search"
                    autoComplete="off"
                  />
                </div>
                {articlesListQ.isPending && <CorpusListSkeleton />}
                {corpusEmpty && (
                  <p className="text-[13px] text-muted-foreground">
                    Aucun article dans cette vue. Élargissez la recherche ou
                    attendez la fin du traitement.
                  </p>
                )}
                {!articlesListQ.isPending && listArticles.length > 0 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {listArticles.map((a) => (
                      <div
                        key={a.id}
                        className="rounded border border-border-light bg-card/90 p-3 sm:p-4"
                      >
                        <ArticleRow
                          article={a}
                          selected={selectedIds.has(a.id)}
                          onSelectedChange={(next) => toggleArticle(a.id, next)}
                          attachmentLabel={
                            articleAttachmentLabels.get(a.id) ?? null
                          }
                          variant="dense"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
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
