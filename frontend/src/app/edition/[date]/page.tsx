"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArticleRow } from "@/components/composition/ArticleRow";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import { TopicSection } from "@/components/edition/TopicSection";
import { ReviewPreview } from "@/components/review/review-preview";
import { api } from "@/lib/api";
import type {
  Article,
  Edition,
  EditionDetectionStatus,
  EditionTopic,
} from "@/lib/types";

type EditionView = "topics" | "list" | "search";

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

function detectionLabel(s: EditionDetectionStatus | undefined): string {
  switch (s) {
    case "done":
      return "Détection des sujets terminée";
    case "running":
      return "Détection des sujets en cours…";
    case "failed":
      return "Échec de la détection des sujets";
    default:
      return "Détection des sujets en attente";
  }
}

export default function EditionSommairePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const qc = useQueryClient();

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
  });

  const editionId = editionQ.data?.id;
  const detectionStatus: EditionDetectionStatus =
    editionQ.data?.detection_status ?? "pending";

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "full"] as const,
    queryFn: () =>
      api.editionTopics(editionId!, {
        includeArticlePreviews: true,
        maxArticlePreviewsPerTopic: 200,
      }),
    enabled: Boolean(editionId),
  });

  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
  });

  const overviewQ = useQuery({
    queryKey: ["articlesOverview", date] as const,
    queryFn: () =>
      api.articles({
        sort: "relevance",
        limit: "1",
        days: "14",
        group_syndicated: "true",
      }),
    enabled: Boolean(date),
  });

  const [view, setView] = useState<EditionView | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const topics = topicsQ.data ?? [];

  const needFlatArticles =
    view === "list" ||
    view === "search" ||
    (view === null && !(detectionStatus === "done" && topics.length > 0));

  const articlesListQ = useQuery({
    queryKey: ["editionArticlesList", view, debouncedQ, needFlatArticles] as const,
    queryFn: () =>
      api.articles({
        sort: "relevance",
        limit: "250",
        days: "14",
        group_syndicated: "true",
        ...(view === "search" && debouncedQ ? { q: debouncedQ } : {}),
      }),
    enabled: Boolean(date) && needFlatArticles,
  });

  const listArticles: Article[] = articlesListQ.data?.articles ?? [];

  const effectiveView: EditionView = useMemo(() => {
    if (view === "search") {
      return "search";
    }
    if (view === "list") {
      return "list";
    }
    if (view === "topics") {
      return "topics";
    }
    if (detectionStatus === "done" && topics.length > 0) {
      return "topics";
    }
    return "list";
  }, [view, detectionStatus, topics.length]);

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
    const total = overviewQ.data?.total ?? 0;
    const byC = overviewQ.data?.counts_by_country ?? {};
    return {
      articles: total,
      countries: Object.keys(byC).length,
      developments: 0,
    };
  }, [topics, overviewQ.data]);

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
    editionQ.isPending || (editionQ.data && topicsQ.isPending);
  const edition = editionQ.data ?? null;
  const err =
    editionQ.error?.message ??
    topicsQ.error?.message ??
    articlesListQ.error?.message ??
    null;

  return (
    <div className="space-y-10 pb-44">
      <header className="max-w-2xl">
        <p className="olj-rubric">Revue de presse — édition du jour</p>
        <h1 className="mt-3 font-[family-name:var(--font-serif)] text-[28px] font-semibold leading-[1.2] tracking-tight text-foreground capitalize sm:text-[32px]">
          {date ? formatDateFr(date) : "—"}
        </h1>
        {edition && (
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            <span className="tabular-nums">{stats.articles}</span>{" "}
            article{stats.articles > 1 ? "s" : ""} dans la fenêtre ·{" "}
            <span className="tabular-nums">{stats.countries}</span> pays
            représentés
            {stats.developments > 0 ? (
              <>
                {" "}
                · <span className="tabular-nums">{stats.developments}</span>{" "}
                développement{stats.developments > 1 ? "s" : ""} détecté
                {stats.developments > 1 ? "s" : ""}
              </>
            ) : null}
          </p>
        )}
        <p className="mt-2 text-[12px] text-muted-foreground">
          {detectionLabel(detectionStatus)}
        </p>
      </header>

      {err && (
        <p
          className="border-l-2 border-destructive pl-3 text-[13px] text-destructive"
          role="alert"
          aria-live="polite"
        >
          {err}
        </p>
      )}

      {detectionStatus === "failed" && (
        <aside
          className="border-l-[3px] border-accent bg-surface/60 py-3 pl-4 pr-2 text-[13px] leading-relaxed text-foreground-body"
          role="status"
        >
          <p className="font-[family-name:var(--font-serif)] text-[15px] font-medium text-foreground">
            Détection des sujets indisponible
          </p>
          <p className="mt-1.5 text-muted-foreground">
            La vue liste par pertinence reste utilisable pour composer la revue.
          </p>
          <button
            type="button"
            className="olj-link-action mt-3 disabled:opacity-45"
            disabled={!editionId || detectMutation.isPending}
            onClick={() => detectMutation.mutate()}
          >
            {detectMutation.isPending
              ? "Relance en cours…"
              : "Relancer la détection automatique"}
          </button>
        </aside>
      )}

      <div
        className="mb-10 flex flex-wrap gap-x-8 gap-y-1 border-b border-border"
        role="tablist"
        aria-label="Mode d’affichage de l’édition"
      >
        <button
          type="button"
          role="tab"
          aria-selected={effectiveView === "topics"}
          className={
            effectiveView === "topics"
              ? "olj-tab olj-tab--active"
              : "olj-tab olj-tab--inactive"
          }
          onClick={() => {
            setView("topics");
            setSearchInput("");
            setDebouncedQ("");
          }}
        >
          Par développements
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveView === "list"}
          className={
            effectiveView === "list"
              ? "olj-tab olj-tab--active"
              : "olj-tab olj-tab--inactive"
          }
          onClick={() => {
            setView("list");
            setSearchInput("");
            setDebouncedQ("");
          }}
        >
          Liste complète
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={effectiveView === "search"}
          className={
            effectiveView === "search"
              ? "olj-tab olj-tab--active"
              : "olj-tab olj-tab--inactive"
          }
          onClick={() => setView("search")}
        >
          Recherche
        </button>
      </div>

      {effectiveView === "search" && (
        <div className="max-w-xl pt-2">
          <label className="olj-rubric mb-1 block" htmlFor="edition-search-q">
            Recherche dans le corpus
          </label>
          <input
            id="edition-search-q"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Titre, résumé, thèse, angle éditorial…"
            className="olj-field-search"
            autoComplete="off"
          />
        </div>
      )}

      {loading && (
        <p className="text-[13px] text-muted-foreground">
          Chargement de l’édition…
        </p>
      )}

      {!loading && effectiveView === "topics" && topics.length === 0 && (
        <p className="max-w-xl text-[13px] leading-relaxed text-foreground-body">
          Aucun développement groupé pour cette date. Passez en{" "}
          <button
            type="button"
            className="olj-link-action inline p-0 align-baseline"
            onClick={() => {
              setView("list");
              setSearchInput("");
              setDebouncedQ("");
            }}
          >
            liste complète
          </button>{" "}
          ou relancez la détection depuis la barre du bas.
        </p>
      )}

      {!loading &&
        effectiveView === "topics" &&
        topics.map((t: EditionTopic) => (
          <TopicSection
            key={t.id}
            topic={t}
            selectedIds={selectedIds}
            onToggleArticle={toggleArticle}
          />
        ))}

      {!loading && (effectiveView === "list" || effectiveView === "search") && (
        <section className="space-y-0">
          <h2 className="olj-rubric olj-rule mb-6">
            {effectiveView === "search"
              ? "Résultats de recherche"
              : "Corpus du jour — pertinence éditoriale"}
          </h2>
          {articlesListQ.isPending && (
            <p className="text-[13px] text-muted-foreground">Chargement…</p>
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
            <h2 className="olj-rubric">Brouillon — texte pour le CMS</h2>
            <button
              type="button"
              className="text-[12px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              onClick={() => setGenOpen(false)}
            >
              Masquer le panneau
            </button>
          </div>
          <ReviewPreview text={generatedText} stickyToolbar />
        </section>
      )}

      <nav className="border-t border-border pt-8 text-[13px] text-muted-foreground">
        <Link
          href={`/edition/${date}/compose`}
          className="underline decoration-border underline-offset-4 hover:text-foreground"
        >
          Composition multi-sujets
        </Link>
        <span className="mx-2 text-border">·</span>
        <Link
          href="/regie"
          className="underline decoration-border underline-offset-4 hover:text-foreground"
        >
          Régie
        </Link>
      </nav>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
        <div className="pointer-events-auto mx-auto max-w-[80rem] border-t border-border bg-background px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <CoverageGaps
              selectedCountryCodes={selectedCountryCodes}
              targets={coverageQ.data ?? null}
            />
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
              <p className="text-center text-[12px] text-muted-foreground sm:text-right">
                <span className="tabular-nums font-medium text-foreground">
                  {selectedIds.size}
                </span>{" "}
                article{selectedIds.size > 1 ? "s" : ""} retenu
                {selectedIds.size > 1 ? "s" : ""} pour la génération
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="olj-btn-secondary"
                  disabled={!editionId || detectMutation.isPending}
                  onClick={() => detectMutation.mutate()}
                >
                  {detectMutation.isPending
                    ? "Détection…"
                    : "Redétecter les sujets"}
                </button>
                <button
                  type="button"
                  className="olj-btn-primary"
                  disabled={selectedIds.size === 0 || generateMutation.isPending}
                  onClick={() => generateMutation.mutate()}
                >
                  {generateMutation.isPending
                    ? "Rédaction en cours…"
                    : "Générer la revue"}
                </button>
              </div>
            </div>
          </div>
          {generateMutation.isError && (
            <p className="mt-3 border-l-2 border-destructive pl-3 text-[12px] text-destructive" role="alert">
              {(generateMutation.error as Error)?.message ?? "Échec de la génération"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
