"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState, useEffect } from "react";
import { ArticleRow } from "@/components/composition/ArticleRow";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { EditionThemesView } from "@/components/edition/edition-themes-view";
import { TopicSection } from "@/components/edition/TopicSection";
import { ReviewPreview } from "@/components/review/review-preview";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import {
  CORPUS_ARTICLE_TYPE_CODES,
  CORPUS_SOURCE_LANGUAGE_CODES,
  articleTypeLabelFr,
  sourceLanguageLabelFr,
} from "@/lib/article-labels-fr";
import { clusterFallbackDisplayTitle } from "@/lib/cluster-display";
import { api } from "@/lib/api";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type {
  Article,
  Edition,
  EditionDetectionStatus,
  EditionTopic,
} from "@/lib/types";

const QUERY_STALE_MS = 5 * 60 * 1000;
const TOPIC_SUMMARY_PREVIEWS = 6;
const CORPUS_LIST_LIMIT = 250;

type CorpusSortKey = "relevance" | "date" | "confidence" | "confidence_asc";

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

/** Période couverte : forme courte pour l’en-tête (Beyrouth). */
function formatEditionWindowCompact(isoStart: string, isoEnd: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Beirut",
  };
  const fmt = new Intl.DateTimeFormat("fr-FR", opts);
  return `${fmt.format(new Date(isoStart))} → ${fmt.format(new Date(isoEnd))} · Beyrouth`;
}

function shiftEditionDate(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Chaîne renvoyée par APScheduler (ex. `2026-03-24 06:00:00+00:00`). */
function parseSchedulerDate(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const isoLike = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const d = new Date(isoLike);
  return Number.isNaN(d.getTime()) ? null : d;
}

function schedulerJobTimeZone(jobId: string): "UTC" | "Asia/Beirut" {
  return jobId === "edition_daily_create_beirut" ? "Asia/Beirut" : "UTC";
}

function schedulerJobTitleFr(jobId: string, fallbackName: string): string {
  switch (jobId) {
    case "daily_pipeline_morning":
      return "Collecte et traitement du matin";
    case "daily_pipeline_afternoon":
      return "Mise à jour de l’après-midi";
    case "edition_daily_create_beirut":
      return "Ouverture de l’édition du lendemain";
    default:
      return fallbackName;
  }
}

function formatJobNextRunFr(jobId: string, nextRun: string | null): string {
  if (!nextRun) {
    return "Non planifié";
  }
  const d = parseSchedulerDate(nextRun);
  if (!d) {
    return nextRun;
  }
  const tz = schedulerJobTimeZone(jobId);
  const suffix = tz === "UTC" ? " UTC" : " · heure de Beyrouth";
  return (
    new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(d) + suffix
  );
}

/** Dernier passage enregistré côté serveur (événement APScheduler, même fuseau que le prochain). */
function formatJobLastRunFr(
  jobId: string,
  lastRunAt: string | null | undefined,
  lastOk: boolean | null | undefined,
): string | null {
  if (lastRunAt == null || lastRunAt === "") {
    return null;
  }
  const d = parseSchedulerDate(lastRunAt);
  const tz = schedulerJobTimeZone(jobId);
  const suffix = tz === "UTC" ? " UTC" : " · heure de Beyrouth";
  let base: string;
  if (!d) {
    base = lastRunAt;
  } else {
    base =
      new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: tz,
      }).format(d) + suffix;
  }
  if (lastOk === false) {
    return `${base} · échec`;
  }
  return base;
}

function formatSessionDateTimeFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(d);
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
  const [corpusCountry, setCorpusCountry] = useState("");
  const [corpusLanguage, setCorpusLanguage] = useState("");
  const [corpusType, setCorpusType] = useState("");
  const [corpusSort, setCorpusSort] = useState<CorpusSortKey>("relevance");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const corpusFacetsQ = useQuery({
    queryKey: ["editionArticlesFacets", editionId, debouncedQ] as const,
    queryFn: () =>
      api.articles({
        edition_id: editionId!,
        sort: "relevance",
        limit: "1",
        offset: "0",
        group_syndicated: "true",
        ...(debouncedQ ? { q: debouncedQ } : {}),
      }),
    enabled: Boolean(date) && Boolean(editionId),
    staleTime: 60_000,
  });

  const articlesListQ = useQuery({
    queryKey: [
      "editionArticlesList",
      editionId,
      debouncedQ,
      "unified",
      corpusCountry,
      corpusLanguage,
      corpusType,
      corpusSort,
    ] as const,
    queryFn: () =>
      api.articles({
        edition_id: editionId!,
        sort: corpusSort,
        limit: String(CORPUS_LIST_LIMIT),
        group_syndicated: "true",
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...(corpusCountry ? { country: corpusCountry } : {}),
        ...(corpusLanguage ? { language: corpusLanguage } : {}),
        ...(corpusType ? { article_type: corpusType } : {}),
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

  const editionWindowCompact = useMemo(() => {
    if (!edition?.window_start || !edition?.window_end) return null;
    return formatEditionWindowCompact(edition.window_start, edition.window_end);
  }, [edition?.window_start, edition?.window_end]);

  const editionDatePrev = date ? shiftEditionDate(date, -1) : "";
  const editionDateNext = date ? shiftEditionDate(date, 1) : "";

  const schedulerPreview = useMemo(() => {
    const jobs = statusQ.data?.jobs ?? [];
    const rows = jobs.map((j) => {
      const d = parseSchedulerDate(j.next_run ?? "");
      const lastAt = j.last_run_at ?? null;
      const lastOk = j.last_run_ok ?? null;
      const lastTs = lastAt ? parseSchedulerDate(lastAt)?.getTime() : null;
      return {
        id: j.id,
        title: schedulerJobTitleFr(j.id, j.name),
        ts: d?.getTime() ?? Number.POSITIVE_INFINITY,
        formattedNext: formatJobNextRunFr(j.id, j.next_run),
        formattedLast: formatJobLastRunFr(j.id, lastAt, lastOk),
        lastTs: lastTs ?? null,
        lastOk,
      };
    });
    rows.sort((a, b) => a.ts - b.ts);
    const next =
      rows.length > 0 && rows[0] !== undefined && rows[0].ts !== Number.POSITIVE_INFINITY
        ? rows[0]
        : null;
    let recentServerRun: {
      lastTs: number;
      title: string;
      formattedLast: string;
      lastOk: boolean | null;
    } | null = null;
    for (const r of rows) {
      if (r.lastTs == null) {
        continue;
      }
      if (!recentServerRun || r.lastTs > recentServerRun.lastTs) {
        const fl = r.formattedLast;
        if (fl) {
          recentServerRun = {
            lastTs: r.lastTs,
            title: r.title,
            formattedLast: fl,
            lastOk: r.lastOk,
          };
        }
      }
    }
    return { rows, next, recentServerRun };
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
      await qc.invalidateQueries({ queryKey: ["editionArticlesFacets"] });
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

  const corpusCountryOptions = useMemo(() => {
    const raw = corpusFacetsQ.data?.counts_by_country;
    if (!raw || typeof raw !== "object") {
      return [] as { code: string; count: number }[];
    }
    return Object.entries(raw)
      .map(([code, count]) => ({
        code: code.trim().toUpperCase(),
        count: Number(count) || 0,
      }))
      .filter((x) => x.code)
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, "fr"));
  }, [corpusFacetsQ.data?.counts_by_country]);

  const corpusTotalCount = articlesListQ.data?.total ?? 0;
  const corpusTruncated = corpusTotalCount > CORPUS_LIST_LIMIT;

  const resetCorpusFilters = useCallback(() => {
    setCorpusCountry("");
    setCorpusLanguage("");
    setCorpusType("");
    setCorpusSort("relevance");
  }, []);

  const corpusFiltersActive =
    Boolean(corpusCountry) ||
    Boolean(corpusLanguage) ||
    Boolean(corpusType) ||
    corpusSort !== "relevance";

  return (
    <div className="space-y-10 pb-36">
      <header className="max-w-4xl border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="olj-rubric">Édition</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold capitalize leading-tight text-foreground sm:text-[30px]">
                {date ? formatDateFr(date) : "Date non renseignée"}
              </h1>
              {date ? (
                <nav
                  className="flex flex-wrap items-center gap-1.5 text-[11px]"
                  aria-label="Naviguer entre les jours"
                >
                  <Link
                    href={`/edition/${editionDatePrev}`}
                    className="olj-nav-item olj-nav-item--subtle"
                  >
                    ← Veille
                  </Link>
                  <Link
                    href={`/edition/${editionDateNext}`}
                    className="olj-nav-item olj-nav-item--subtle"
                  >
                    Lendemain →
                  </Link>
                </nav>
              ) : null}
            </div>
            {edition && editionWindowCompact ? (
              <p
                className="mt-2 max-w-3xl text-[12px] leading-snug text-foreground-body"
                title={editionWindowLabel ?? undefined}
              >
                <span className="font-semibold text-foreground">Collecte couverte (Beyrouth) :</span>{" "}
                {editionWindowCompact}
              </p>
            ) : null}
            {edition ? (
              <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                {stats.articles} article{stats.articles > 1 ? "s" : ""} · {stats.countries} pays · {stats.developments}{" "}
                sujet{stats.developments > 1 ? "s" : ""} au sommaire (max. {edition.target_topics_max})
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {pipeline ? (
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
            ) : null}
          </div>
        </div>

        {edition ? (
          <details className="mt-4 border-t border-border pt-3">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground marker:text-muted-foreground hover:text-foreground">
              Structure de la page · lexique
            </summary>
            <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
              <p>
                <strong className="font-medium text-foreground/90">1</strong> Sommaire (grands sujets) ·{" "}
                <strong className="font-medium text-foreground/90">2</strong> Affinités (textes proches) ·{" "}
                <strong className="font-medium text-foreground/90">3</strong> Corpus et outils en bas de page.
              </p>
              <p className="border-l-2 border-border pl-2">
                <em>Sujet</em> au sommaire = <em>développement</em> côté outil. Les affinités suivent une autre logique
                (ressemblance entre textes).
              </p>
            </div>
          </details>
        ) : null}

        {date ? (
          <details className="mt-2 border-t border-border pt-3">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground marker:text-muted-foreground hover:text-foreground">
              Planificateur · historique
            </summary>
            <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
              {pipeline?.running ? (
                <p
                  className="border-l-2 border-[#c8102e] pl-2 font-medium text-foreground"
                  role="status"
                  aria-live="polite"
                >
                  Traitement serveur : {pipeline.running.label}…
                </p>
              ) : null}
              {statusQ.isError ? (
                <p className="text-destructive">Statut planificateur indisponible (erreur API).</p>
              ) : statusQ.isPending ? (
                <p>Chargement du planificateur…</p>
              ) : schedulerPreview.next ? (
                <p>
                  <span className="font-medium text-foreground">Prochain passage auto :</span>{" "}
                  {schedulerPreview.next.formattedNext} ({schedulerPreview.next.title}).
                </p>
              ) : schedulerPreview.rows.length === 0 ? (
                <p>Aucune tâche planifiée renvoyée par le serveur.</p>
              ) : null}
              <p>
                Fuseaux (UTC / Beyrouth), liste des tâches et historique :{" "}
                <Link href="/regie/pipeline" className="olj-link-action font-medium">
                  Régie — Collecte
                </Link>
                {" · "}
                <Link href="/regie/logs" className="olj-link-action font-medium">
                  Journaux
                </Link>
                .
              </p>
              {pipeline?.lastRun ? (
                <p>
                  Dernier « Actualiser » (session) : {formatSessionDateTimeFr(pipeline.lastRun.at)} —{" "}
                  {pipeline.lastRun.label}
                  {pipeline.lastRun.ok ? "" : " · erreur"}.
                </p>
              ) : null}
            </div>
          </details>
        ) : null}

        {vigieGlobaleHint ? (
          <p className="mt-3 text-[10px] leading-snug text-muted-foreground">{vigieGlobaleHint}</p>
        ) : null}

        {detectionMessage ? (
          <p className="mt-3 text-[12px] text-muted-foreground">{detectionMessage}</p>
        ) : null}
        {editionId &&
          detectionStatus !== "running" &&
          (detectionStatus === "pending" ||
            detectionStatus === "failed" ||
            (detectionStatus === "done" && topics.length === 0)) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
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
            <div className="mt-6 rounded-lg border border-border bg-surface-warm/40 px-5 py-8 sm:px-8">
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
              <p className="mt-4 text-[12px] text-muted-foreground">
                Planificateur : section repliable en haut de page ou{" "}
                <Link href="/regie/pipeline" className="olj-link-action">
                  Régie — Collecte
                </Link>
                .
              </p>
            </div>
          )}

          {!fullyEmpty && (
            <div className="mt-6 space-y-14">
              {hasTopicFeed ? (
                <section>
                  <h2 className="olj-rubric olj-rule mb-2">Grands sujets</h2>
                  <p className="mb-6 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                    <strong className="font-medium text-foreground/90">Sujet 1</strong> ouvre le brief ; les rangs
                    suivants poursuivent le sommaire dans l’ordre proposé.
                  </p>
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
                    Aucun grand sujet pour cette date. La section{" "}
                    <strong className="font-medium text-foreground">Textes très proches</strong> (affinités) reste
                    disponible ci-dessous si le corpus le permet.
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
                <section
                  className="rounded-xl border border-border bg-surface-warm/30 p-5 shadow-sm sm:p-7"
                  aria-labelledby="edition-affinity-heading"
                >
                  <header className="mb-6 border-b border-border pb-5">
                    <p className="olj-rubric">Affinités</p>
                    <h2
                      id="edition-affinity-heading"
                      className="mt-2 font-[family-name:var(--font-serif)] text-[18px] font-semibold leading-snug tracking-tight text-foreground sm:text-[19px]"
                    >
                      Textes très proches
                    </h2>
                    <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                      Articles rapprochés par ressemblance automatique. Par défaut, seuls les blocs{" "}
                      <strong className="font-medium text-foreground-body">multi-pays ou multi-médias</strong> sont
                      listés ; le filtre se règle dans le bloc ci-dessous.
                    </p>
                  </header>
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
                <div className="space-y-4 pb-4">
                  <div className="max-w-xl">
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
                  <div className="max-w-4xl space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <p className="olj-rubric w-full">Filtres et tri</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] text-muted-foreground sm:max-w-[14rem]">
                        <span>Pays</span>
                        <select
                          className="olj-focus rounded-md border border-border bg-background px-2 py-2 text-[12px] text-foreground"
                          value={corpusCountry}
                          onChange={(e) => setCorpusCountry(e.target.value)}
                          aria-label="Filtrer par pays"
                        >
                          <option value="">Tous les pays</option>
                          {corpusCountryOptions.map(({ code, count }) => {
                            const flag = REGION_FLAG_EMOJI[code];
                            const name = labelsFr?.[code]?.trim() || code;
                            return (
                              <option key={code} value={code}>
                                {flag ? `${flag} ` : ""}
                                {name} ({count})
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] text-muted-foreground sm:max-w-[14rem]">
                        <span>Langue source</span>
                        <select
                          className="olj-focus rounded-md border border-border bg-background px-2 py-2 text-[12px] text-foreground"
                          value={corpusLanguage}
                          onChange={(e) => setCorpusLanguage(e.target.value)}
                          aria-label="Filtrer par langue source"
                        >
                          <option value="">Toutes</option>
                          {CORPUS_SOURCE_LANGUAGE_CODES.map((code) => (
                            <option key={code} value={code}>
                              {sourceLanguageLabelFr(code) ?? code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] text-muted-foreground sm:max-w-[14rem]">
                        <span>Type d’article</span>
                        <select
                          className="olj-focus rounded-md border border-border bg-background px-2 py-2 text-[12px] text-foreground"
                          value={corpusType}
                          onChange={(e) => setCorpusType(e.target.value)}
                          aria-label="Filtrer par type d’article"
                        >
                          <option value="">Tous les types</option>
                          {CORPUS_ARTICLE_TYPE_CODES.map((code) => (
                            <option key={code} value={code}>
                              {articleTypeLabelFr(code) ?? code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[11px] text-muted-foreground sm:max-w-[14rem]">
                        <span>Tri</span>
                        <select
                          className="olj-focus rounded-md border border-border bg-background px-2 py-2 text-[12px] text-foreground"
                          value={corpusSort}
                          onChange={(e) =>
                            setCorpusSort(e.target.value as CorpusSortKey)
                          }
                          aria-label="Trier la liste"
                        >
                          <option value="relevance">Pertinence éditoriale</option>
                          <option value="date">Date de collecte</option>
                          <option value="confidence">Confiance (desc.)</option>
                          <option value="confidence_asc">Confiance (asc.)</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {corpusFiltersActive ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium text-[#c8102e] underline decoration-[#c8102e]/35 underline-offset-2 hover:decoration-[#c8102e]"
                          onClick={resetCorpusFilters}
                        >
                          Réinitialiser filtres et tri
                        </button>
                      ) : null}
                      {!articlesListQ.isPending && listArticles.length > 0 ? (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {listArticles.length} affiché
                          {listArticles.length > 1 ? "s" : ""}
                          {corpusTotalCount > listArticles.length
                            ? ` sur ${corpusTotalCount.toLocaleString("fr-FR")}`
                            : corpusTotalCount > 0
                              ? ` · ${corpusTotalCount.toLocaleString("fr-FR")} au total`
                              : ""}
                          {corpusTruncated
                            ? ` (plafond ${CORPUS_LIST_LIMIT} — affinez les filtres)`
                            : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
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
                        className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5"
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
        <section className="border-t border-border bg-surface-warm/25 py-8">
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
        <div className="pointer-events-auto mx-auto max-w-[80rem] border-t border-border bg-background px-5 py-3 shadow-[0_-6px_24px_rgba(27,26,26,0.06)] sm:px-6">
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
