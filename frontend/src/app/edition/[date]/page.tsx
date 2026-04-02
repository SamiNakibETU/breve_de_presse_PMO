"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useEffect, useRef } from "react";
import { EditionDateRail } from "@/components/edition/edition-date-rail";
import { EditionThemesView } from "@/components/edition/edition-themes-view";
import { TopicSection } from "@/components/edition/TopicSection";
import { usePipelineRunnerOptional } from "@/contexts/pipeline-runner";
import { api } from "@/lib/api";
import { shiftIsoDate } from "@/lib/beirut-date";
import { useSelectionStore } from "@/stores/selection-store";
import type {
  Edition,
  EditionDetectionStatus,
  EditionTopic,
} from "@/lib/types";

const QUERY_STALE_MS = 5 * 60 * 1000;
const TOPIC_SUMMARY_PREVIEWS = 6;

/** Tâche de surveillance du bail (intervalle court) — ne pas l’afficher comme « prochain passage » métier. */
const SCHEDULER_EXCLUDE_FROM_NEXT_PREVIEW = new Set(["pipeline_lease_stall_watch"]);

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

function schedulerJobTimeZone(jobId: string): "UTC" | "Asia/Beirut" | "Europe/Paris" {
  if (jobId === "edition_daily_create_beirut") {
    return "Asia/Beirut";
  }
  if (jobId === "daily_pipeline_monday" || jobId === "daily_pipeline_weekday") {
    return "Europe/Paris";
  }
  return "UTC";
}

function schedulerJobTitleFr(jobId: string, fallbackName: string): string {
  switch (jobId) {
    case "daily_pipeline_monday":
      return "Mise à jour week-end (lundi 9h Paris)";
    case "daily_pipeline_weekday":
      return "Mise à jour mardi–vendredi (9h Paris)";
    case "daily_pipeline_morning":
      return "Collecte du matin (ancien horaire)";
    case "daily_pipeline_afternoon":
      return "Mise à jour de l’après-midi (ancien horaire)";
    case "edition_daily_create_beirut":
      return "Ouverture de l’édition du lendemain";
    case "pipeline_completion_retry":
      return "Relance si pipeline incomplet";
    case "pipeline_lease_stall_watch":
      return "Surveillance du bail pipeline";
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
  const suffix =
    tz === "UTC"
      ? " UTC"
      : tz === "Asia/Beirut"
        ? " · heure de Beyrouth"
        : " · heure de Paris";
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
  const suffix =
    tz === "UTC"
      ? " UTC"
      : tz === "Asia/Beirut"
        ? " · heure de Beyrouth"
        : " · heure de Paris";
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
    staleTime: 30_000,
    refetchInterval: (q) =>
      q.state.data?.pipeline_running === true ? 4_000 : false,
  });

  const topics = useMemo(() => {
    const list = topicsQ.data ?? [];
    return [...list].sort((a, b) => {
      const ra = a.user_rank ?? a.rank ?? 999;
      const rb = b.user_rank ?? b.rank ?? 999;
      return ra - rb;
    });
  }, [topicsQ.data]);
  const hasTopicFeed = detectionStatus === "done" && topics.length > 0;

  const clustersFallbackQ = useQuery({
    queryKey: ["editionClustersFallback", editionId] as const,
    queryFn: () => api.editionClustersFallback(editionId!),
    enabled: Boolean(editionId) && detectionStatus !== "running",
    staleTime: QUERY_STALE_MS,
  });

  const selectionsQ = useQuery({
    queryKey: ["editionSelections", editionId] as const,
    queryFn: () => api.editionSelections(editionId!),
    enabled: Boolean(editionId),
    staleTime: 15_000,
  });

  const hydrateFromServer = useSelectionStore((s) => s.hydrateFromServer);
  const setTopicArticlesStore = useSelectionStore((s) => s.setTopicArticles);
  const setExtraArticlesStore = useSelectionStore((s) => s.setExtraArticles);
  const selectionBundle = useSelectionStore(
    useCallback(
      (s) => (editionId ? s.byEditionId[editionId] : undefined),
      [editionId],
    ),
  );
  const patchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const extraPatchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const migratedExtrasRef = useRef(false);

  useEffect(() => {
    if (!editionId || !selectionsQ.data) {
      return;
    }
    hydrateFromServer(editionId, selectionsQ.data);
  }, [editionId, selectionsQ.data, hydrateFromServer]);

  useEffect(() => {
    if (!editionId || !selectionsQ.isSuccess || migratedExtrasRef.current) {
      return;
    }
    const server = selectionsQ.data?.extra_article_ids ?? [];
    if (server.length > 0) {
      migratedExtrasRef.current = true;
      return;
    }
    try {
      const raw = localStorage.getItem(`olj-edition-extra-${editionId}`);
      if (!raw) {
        migratedExtrasRef.current = true;
        return;
      }
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) {
        migratedExtrasRef.current = true;
        return;
      }
      const ids = arr.filter((x): x is string => typeof x === "string");
      if (ids.length === 0) {
        migratedExtrasRef.current = true;
        return;
      }
      migratedExtrasRef.current = true;
      void api
        .editionComposePreferences(editionId, {
          extra_selected_article_ids: ids,
        })
        .then(() => {
          localStorage.removeItem(`olj-edition-extra-${editionId}`);
          void qc.invalidateQueries({
            queryKey: ["editionSelections", editionId],
          });
        })
        .catch(() => {
          /* ignore */
        });
    } catch {
      migratedExtrasRef.current = true;
    }
  }, [editionId, selectionsQ.isSuccess, selectionsQ.data, qc]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    const topics = selectionBundle?.topics ?? {};
    for (const ids of Object.values(topics)) {
      for (const id of ids) {
        s.add(id);
      }
    }
    for (const id of selectionBundle?.extra_article_ids ?? []) {
      s.add(id);
    }
    return s;
  }, [selectionBundle]);

  const scheduleTopicPatch = useCallback(
    (topicId: string, ids: string[]) => {
      if (!editionId) {
        return;
      }
      const prev = patchTimers.current.get(topicId);
      if (prev) {
        clearTimeout(prev);
      }
      const t = setTimeout(() => {
        void api
          .editionTopicSelection(editionId, topicId, ids)
          .then(() => {
            void qc.invalidateQueries({
              queryKey: ["editionSelections", editionId],
            });
          })
          .catch(() => {
            /* erreur réseau : l’état local reste ; prochain refetch corrige */
          });
        patchTimers.current.delete(topicId);
      }, 320);
      patchTimers.current.set(topicId, t);
    },
    [editionId, qc],
  );

  const onTopicArticleToggle = useCallback(
    (topicId: string, articleId: string, next: boolean) => {
      if (!editionId) {
        return;
      }
      const cur = [...(selectionBundle?.topics[topicId] ?? [])];
      if (next) {
        if (!cur.includes(articleId)) {
          cur.push(articleId);
        }
      } else {
        const ix = cur.indexOf(articleId);
        if (ix >= 0) {
          cur.splice(ix, 1);
        }
      }
      setTopicArticlesStore(editionId, topicId, cur);
      scheduleTopicPatch(topicId, cur);
    },
    [editionId, selectionBundle?.topics, setTopicArticlesStore, scheduleTopicPatch],
  );

  const scheduleExtraPatch = useCallback(
    (ids: Set<string>) => {
      if (!editionId) {
        return;
      }
      if (extraPatchTimer.current) {
        clearTimeout(extraPatchTimer.current);
      }
      extraPatchTimer.current = setTimeout(() => {
        void api
          .editionComposePreferences(editionId, {
            extra_selected_article_ids: [...ids],
          })
          .then(() => {
            void qc.invalidateQueries({
              queryKey: ["editionSelections", editionId],
            });
          })
          .catch(() => {
            /* erreur réseau : l’état local reste ; prochain refetch corrige */
          });
        extraPatchTimer.current = null;
      }, 400);
    },
    [editionId, qc],
  );

  const toggleExtraArticle = useCallback(
    (id: string, next: boolean) => {
      if (!editionId) {
        return;
      }
      const prev = selectionBundle?.extra_article_ids ?? [];
      const n = new Set(prev);
      if (next) {
        n.add(id);
      } else {
        n.delete(id);
      }
      const arr = [...n];
      setExtraArticlesStore(editionId, arr);
      scheduleExtraPatch(n);
    },
    [editionId, selectionBundle?.extra_article_ids, setExtraArticlesStore, scheduleExtraPatch],
  );

  const clusterRows = useMemo(
    () => clustersFallbackQ.data ?? [],
    [clustersFallbackQ.data],
  );

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
      ? `Vue d’ensemble : ${statsQ.data.total_collected_24h.toLocaleString("fr-FR")} article(s) en base sur les dernières 24 h (UTC), toutes éditions confondues.`
      : null;

  const editionWindowLabel = useMemo(() => {
    if (!edition?.window_start || !edition?.window_end) return null;
    return formatEditionWindowBeirut(edition.window_start, edition.window_end);
  }, [edition?.window_start, edition?.window_end]);

  const editionWindowCompact = useMemo(() => {
    if (!edition?.window_start || !edition?.window_end) return null;
    return formatEditionWindowCompact(edition.window_start, edition.window_end);
  }, [edition?.window_start, edition?.window_end]);

  const editionDatePrev = date ? shiftIsoDate(date, -1) : "";
  const editionDateNext = date ? shiftIsoDate(date, 1) : "";

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
      rows.find(
        (r) =>
          !SCHEDULER_EXCLUDE_FROM_NEXT_PREVIEW.has(r.id) &&
          r.ts !== Number.POSITIVE_INFINITY,
      ) ?? null;
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

  const detectMutation = useMutation({
    mutationFn: () => api.editionDetectTopics(editionId!),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["edition", date] });
      await qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
      await qc.invalidateQueries({
        queryKey: ["editionClustersFallback", editionId],
      });
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const loading =
    editionQ.isPending || (Boolean(editionId) && topicsQ.isPending);

  const detectionMessage = detectionLabel(detectionStatus);
  const err =
    editionQ.error?.message ??
    topicsQ.error?.message ??
    selectionsQ.error?.message ??
    null;

  const fullyEmpty =
    !loading &&
    Boolean(edition) &&
    (edition?.corpus_article_count ?? 0) === 0 &&
    clusterRows.length === 0 &&
    !hasTopicFeed;

  const labelsFr = coverageQ.data?.labels_fr ?? null;

  return (
    <div className="space-y-10">
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
                  className="mt-1 flex w-full min-w-0 max-w-2xl flex-col gap-2 text-[11px] sm:flex-row sm:items-end sm:gap-3"
                  aria-label="Naviguer entre les jours"
                >
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/edition/${editionDatePrev}`}
                      className="olj-nav-item olj-nav-item--subtle"
                    >
                      Veille
                    </Link>
                    <Link
                      href={`/edition/${editionDateNext}`}
                      className="olj-nav-item olj-nav-item--subtle"
                    >
                      Lendemain
                    </Link>
                  </div>
                  <EditionDateRail currentIso={date} className="min-w-0 flex-1" />
                </nav>
              ) : null}
            </div>
            {edition && editionWindowCompact ? (
              <div className="mt-2 max-w-3xl space-y-2">
                <p
                  className="text-[12px] leading-snug text-foreground-body"
                  title={editionWindowLabel ?? undefined}
                >
                  <span className="font-semibold text-foreground">Période couverte (Beyrouth) :</span>{" "}
                  {editionWindowCompact}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Les articles listés correspondent à la date de parution chez le média dans cette plage (mar.–ven. :
                  veille 18h → jour J 6h ; lundi : week-end).{" "}
                  <Link href="/regie/pipeline" className="olj-link-action">
                    Horaires automatiques
                  </Link>
                </p>
              </div>
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
                disabled={
                  pipeline.running !== null ||
                  Boolean(statusQ.data?.pipeline_running)
                }
                title={
                  statusQ.data?.pipeline_running
                    ? "Une mise à jour complète est déjà en cours sur le serveur."
                    : undefined
                }
                onClick={() =>
                  pipeline.startRun("pipeline", "Mise à jour complète")
                }
              >
                {pipeline.running?.key === "pipeline"
                  ? "Mise à jour…"
                  : statusQ.data?.pipeline_running
                    ? "Mise à jour serveur…"
                    : "Mise à jour"}
              </button>
            ) : null}
          </div>
        </div>

        {date ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            {statusQ.data?.pipeline_running && !pipeline?.running ? (
              <p className="border-l-2 border-accent/40 pl-2 text-foreground-body" role="status">
                Mise à jour en cours sur le serveur — le bouton ci-dessus est indisponible jusqu’à la fin.
              </p>
            ) : null}
            {pipeline?.running ? (
              <p className="border-l-2 border-accent pl-2 font-medium text-foreground" role="status">
                {pipeline.running.label}…
              </p>
            ) : null}
            {statusQ.isError ? (
              <p className="text-destructive">Statut automatique indisponible.</p>
            ) : statusQ.isPending ? (
              <p>Chargement des horaires…</p>
            ) : schedulerPreview.next ? (
              <p>
                <span className="font-medium text-foreground">Prochain passage automatique :</span>{" "}
                {schedulerPreview.next.formattedNext} ({schedulerPreview.next.title}).
              </p>
            ) : null}
            <p>
              Détail des tâches et journaux :{" "}
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
                Dernière mise à jour (cette session) : {formatSessionDateTimeFr(pipeline.lastRun.at)} —{" "}
                {pipeline.lastRun.label}
                {pipeline.lastRun.ok ? "" : " · erreur"}.
              </p>
            ) : null}
          </div>
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
                  : "Identifier les sujets"}
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
                Les articles traduits de cette édition (fenêtre Beyrouth) ne sont pas encore disponibles. Lancez une
                mise à jour complète pour collecter et traiter les textes.
              </p>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted-foreground">
                La mise à jour se poursuit sur le serveur (plusieurs minutes). Rechargez la page ensuite.
              </p>
              {pipeline ? (
                <button
                  type="button"
                  className="olj-btn-primary mt-5 text-[13px] disabled:opacity-45"
                  disabled={
                    pipeline.running !== null ||
                    Boolean(statusQ.data?.pipeline_running)
                  }
                  onClick={() =>
                    pipeline.startRun("pipeline", "Mise à jour complète")
                  }
                >
                  {pipeline.running?.key === "pipeline"
                    ? "Mise à jour…"
                    : statusQ.data?.pipeline_running
                      ? "Mise à jour serveur…"
                      : "Lancer la mise à jour complète"}
                </button>
              ) : null}
              <p className="mt-4 text-[12px] text-muted-foreground">
                <Link href="/regie/pipeline" className="olj-link-action">
                  Régie — Collecte
                </Link>
              </p>
            </div>
          )}

          {!fullyEmpty && (
            <div className="mt-6 space-y-14">
              {hasTopicFeed ? (
                <section>
                  <h2 className="olj-rubric olj-rule mb-2">Grands sujets</h2>
                  <p className="mb-6 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                    Chaque bloc affiche son <strong className="font-medium text-foreground/90">rang</strong> dans le
                    sommaire (ordre éditorial). Les numéros suivent <code className="text-[10px]">user_rank</code>{" "}
                    lorsqu’il est défini.
                  </p>
                  <div className="space-y-10">
                    {topics.map((t: EditionTopic) => (
                      <TopicSection
                        key={t.id}
                        topic={t}
                        selectedIds={selectedIds}
                        onToggleArticle={(articleId, next) =>
                          onTopicArticleToggle(t.id, articleId, next)
                        }
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
                    Aucun sujet proposé pour cette date. Les regroupements thématiques ci-dessous restent disponibles si
                    le corpus le permet.
                  </p>
                  {pipeline ? (
                    <button
                      type="button"
                      className="olj-btn-secondary text-[12px] disabled:opacity-45"
                      disabled={
                        pipeline.running !== null ||
                        Boolean(statusQ.data?.pipeline_running)
                      }
                      onClick={() =>
                        pipeline.startRun("pipeline", "Mise à jour complète")
                      }
                    >
                      {pipeline.running?.key === "pipeline"
                        ? "Mise à jour…"
                        : statusQ.data?.pipeline_running
                          ? "Mise à jour serveur…"
                          : "Lancer la mise à jour complète"}
                    </button>
                  ) : null}
                </section>
              )}

              {clusterRows.length > 0 && (
                <section
                  className="rounded-xl border border-border bg-surface-warm/30 p-5 shadow-sm sm:p-7"
                  aria-labelledby="edition-thematic-heading"
                >
                  <header className="mb-6 border-b border-border pb-5">
                    <p className="olj-rubric">Regroupements</p>
                    <h2
                      id="edition-thematic-heading"
                      className="mt-2 font-[family-name:var(--font-serif)] text-[18px] font-semibold leading-snug tracking-tight text-foreground sm:text-[19px]"
                    >
                      Regroupements thématiques
                    </h2>
                    <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                      Textes rapprochés par thème pour comparer des angles. Complément au sommaire des grands sujets.
                    </p>
                  </header>
                  <EditionThemesView
                    rows={clusterRows}
                    selectedIds={selectedIds}
                    onToggleArticle={toggleExtraArticle}
                    isLoading={
                      clustersFallbackQ.isFetching && clusterRows.length === 0
                    }
                    countryLabelsFr={labelsFr}
                    embedded
                  />
                </section>
              )}

              <section className="border-t border-border pt-10">
                <p className="max-w-2xl text-[13px] leading-relaxed text-foreground-body">
                  Pour parcourir tous les articles de cette édition (filtres, recherche, lecture détaillée), ouvrez la
                  liste dédiée.
                </p>
                {editionId ? (
                  <Link
                    href={`/articles?edition_id=${encodeURIComponent(editionId)}`}
                    className="olj-btn-secondary mt-4 inline-flex text-[13px]"
                  >
                    Voir tous les articles de l’édition
                  </Link>
                ) : null}
              </section>
            </div>
          )}
        </>
      )}

    </div>
  );
}
