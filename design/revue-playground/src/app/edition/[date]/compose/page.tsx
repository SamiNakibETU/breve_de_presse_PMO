"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type {
  Edition,
  EditionSelectionsResponse,
  EditionTopic,
  TopicArticlePreview,
} from "@/lib/types";
import {
  type ComposeInstructionsPayload,
  DEFAULT_COMPOSE_INSTRUCTIONS,
  buildInstructionSuffixForLlm,
  parseComposeInstructions,
  stringifyComposeInstructions,
} from "@/lib/compose-instructions";
import { ComposeInstructions } from "@/components/composition/ComposeInstructions";
import { CopyExportButtons } from "@/components/composition/CopyExportButtons";
import { CoverageGaps } from "@/components/composition/CoverageGaps";
import {
  ReadinessIndicator,
  type ReadinessLevel,
} from "@/components/composition/ReadinessIndicator";
import { TopicGeneratedProse } from "@/components/composition/TopicGeneratedProse";
import { TopicReorderList } from "@/components/composition/TopicReorderList";
import {
  ArticleReorderInTopic,
  type ArticleReorderItem,
} from "@/components/composition/ArticleReorderInTopic";

function topicPlainText(t: EditionTopic): string {
  const title = t.title_final ?? t.title_proposed;
  const body = t.generated_text?.trim();
  if (body) {
    return `« ${title} »\n\n${body}`;
  }
  return `« ${title} »\n\n(Texte non encore généré — utilisez « Rédiger ce bloc ».)`;
}

function editionTitleLine(date: string): string {
  try {
    const d = new Date(`${date}T12:00:00`);
    const fr = d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    return fr.charAt(0).toUpperCase() + fr.slice(1);
  } catch {
    return date;
  }
}

/** Articles sélectionnés pour ce sujet, dans l’ordre serveur (display_order). */
function orderedSelectedPreviewsForTopic(
  topic: EditionTopic,
  topicsMap: Record<string, string[]>,
): TopicArticlePreview[] {
  const ids = topicsMap[topic.id] ?? [];
  const byId = new Map(
    (topic.article_previews ?? []).map((p) => [p.id, p]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is TopicArticlePreview => Boolean(p));
}

function topicReadiness(ordered: TopicArticlePreview[]): ReadinessLevel {
  if (ordered.length === 0) {
    return "empty";
  }
  if (ordered.length < 2) {
    return "warn";
  }
  const readyCount = ordered.filter(
    (p) =>
      Boolean((p.summary_fr ?? "").trim()) &&
      p.has_full_translation_fr === true,
  ).length;
  return readyCount >= 2 ? "ok" : "warn";
}

function previewLine(p: TopicArticlePreview): string {
  const t = (p.title_fr || p.title_original || "").trim();
  const th = (p.thesis_summary_fr || "").trim();
  if (th) {
    return th.length > 220 ? `${th.slice(0, 220)}…` : th;
  }
  return t || "—";
}

export default function ComposePage() {
  const params = useParams();
  const date = typeof params.date === "string" ? params.date : "";
  const qc = useQueryClient();
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null);
  const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(
    null,
  );
  const [composeInstructions, setComposeInstructions] =
    useState<ComposeInstructionsPayload>(DEFAULT_COMPOSE_INSTRUCTIONS);
  const instrSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editionQ = useQuery({
    queryKey: ["edition", date] as const,
    queryFn: (): Promise<Edition> => api.editionByDate(date),
    enabled: Boolean(date),
  });

  const editionId = editionQ.data?.id;

  const topicsQ = useQuery({
    queryKey: ["editionTopics", editionId, "compose"] as const,
    queryFn: () =>
      api.editionTopics(editionId!, {
        includeArticlePreviews: true,
        maxArticlePreviewsPerTopic: 200,
      }),
    enabled: Boolean(editionId),
  });

  const selectionsQ = useQuery({
    queryKey: ["editionSelections", editionId] as const,
    queryFn: () => api.editionSelections(editionId!),
    enabled: Boolean(editionId),
  });

  const coverageQ = useQuery({
    queryKey: ["coverageTargets"] as const,
    queryFn: () => api.coverageTargets(),
  });

  useEffect(() => {
    setComposeInstructions(
      parseComposeInstructions(editionQ.data?.compose_instructions_fr),
    );
  }, [editionQ.data?.id, editionQ.data?.compose_instructions_fr]);

  const scheduleInstructionsSave = useCallback(
    (payload: ComposeInstructionsPayload) => {
      if (!editionId) {
        return;
      }
      if (instrSaveTimer.current) {
        clearTimeout(instrSaveTimer.current);
      }
      instrSaveTimer.current = setTimeout(() => {
        void api
          .editionComposePreferences(editionId, {
            compose_instructions_fr: stringifyComposeInstructions(payload),
          })
          .then(() => {
            void qc.invalidateQueries({ queryKey: ["edition", date] });
          })
          .catch(() => {
            /* ignore */
          });
        instrSaveTimer.current = null;
      }, 600);
    },
    [editionId, date, qc],
  );

  const onComposeInstructionsChange = useCallback(
    (next: ComposeInstructionsPayload) => {
      setComposeInstructions(next);
      scheduleInstructionsSave(next);
    },
    [scheduleInstructionsSave],
  );

  const flushInstructions = useCallback(async () => {
    if (!editionId) {
      return;
    }
    if (instrSaveTimer.current) {
      clearTimeout(instrSaveTimer.current);
      instrSaveTimer.current = null;
    }
    await api.editionComposePreferences(editionId, {
      compose_instructions_fr: stringifyComposeInstructions(composeInstructions),
    });
    await qc.invalidateQueries({ queryKey: ["edition", date] });
  }, [editionId, composeInstructions, date, qc]);

  const genAllMutation = useMutation({
    mutationFn: async () => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      await api.editionComposePreferences(editionId, {
        compose_instructions_fr: stringifyComposeInstructions(composeInstructions),
      });
      return api.editionGenerateAll(editionId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["edition", date] });
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  const genTopicMutation = useMutation({
    mutationFn: async ({ topicId }: { topicId: string }) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      const suffix = buildInstructionSuffixForLlm(composeInstructions);
      await api.editionComposePreferences(editionId, {
        compose_instructions_fr: stringifyComposeInstructions(composeInstructions),
      });
      const sel = qc.getQueryData<EditionSelectionsResponse>([
        "editionSelections",
        editionId,
      ]);
      const ordered = sel?.topics[topicId] ?? [];
      const articleIdsForGen =
        ordered.length >= 2 ? ordered : null;
      return api.editionTopicGenerate(
        editionId,
        topicId,
        articleIdsForGen,
        suffix,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
      qc.invalidateQueries({ queryKey: ["edition", date] });
    },
    onSettled: () => setRegeneratingTopicId(null),
  });

  const reorderArticlesMutation = useMutation({
    mutationFn: async ({
      topicId,
      orderedIds,
    }: {
      topicId: string;
      orderedIds: string[];
    }) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      await api.editionTopicSelection(editionId, topicId, orderedIds);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const topics = useMemo(() => {
    const list = topicsQ.data ?? [];
    return [...list].sort((a, b) => {
      const ra = a.user_rank ?? a.rank ?? 999;
      const rb = b.user_rank ?? b.rank ?? 999;
      return ra - rb;
    });
  }, [topicsQ.data]);

  const selectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const ids of Object.values(selectionsQ.data?.topics ?? {})) {
      for (const id of ids) {
        s.add(id);
      }
    }
    for (const id of selectionsQ.data?.extra_article_ids ?? []) {
      s.add(id);
    }
    return s;
  }, [selectionsQ.data]);

  const selectedCountryCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const t of topics) {
      for (const p of t.article_previews ?? []) {
        if (selectedIds.has(p.id) && p.country_code?.trim()) {
          codes.add(p.country_code.trim().toUpperCase());
        }
      }
    }
    for (const p of selectionsQ.data?.extra_articles ?? []) {
      if (selectedIds.has(p.id) && p.country_code?.trim()) {
        codes.add(p.country_code.trim().toUpperCase());
      }
    }
    return [...codes];
  }, [topics, selectedIds, selectionsQ.data?.extra_articles]);

  const selectedAnalysisCount = useMemo(() => {
    let n = 0;
    for (const t of topics) {
      for (const p of t.article_previews ?? []) {
        if (
          selectedIds.has(p.id) &&
          p.analysis_bullets_fr &&
          p.analysis_bullets_fr.length > 0
        ) {
          n += 1;
        }
      }
    }
    for (const p of selectionsQ.data?.extra_articles ?? []) {
      if (
        selectedIds.has(p.id) &&
        p.analysis_bullets_fr &&
        p.analysis_bullets_fr.length > 0
      ) {
        n += 1;
      }
    }
    return n;
  }, [topics, selectedIds, selectionsQ.data?.extra_articles]);

  const topicsSelectionMap = useMemo(
    () => selectionsQ.data?.topics ?? {},
    [selectionsQ.data],
  );

  const selectionByTopic = useMemo(() => {
    const out: {
      topic: EditionTopic;
      picked: TopicArticlePreview[];
    }[] = [];
    for (const t of topics) {
      const picked = orderedSelectedPreviewsForTopic(t, topicsSelectionMap);
      if (picked.length > 0) {
        out.push({ topic: t, picked });
      }
    }
    return out;
  }, [topics, topicsSelectionMap]);

  const extraOnlyPreviews = useMemo(
    () => selectionsQ.data?.extra_articles ?? [],
    [selectionsQ.data?.extra_articles],
  );

  /** Au moins un grand sujet avec 2+ articles cochés (condition serveur pour générer). */
  const topicsWithTwoPlusSelections = useMemo(() => {
    let n = 0;
    for (const t of topics) {
      if (
        orderedSelectedPreviewsForTopic(t, topicsSelectionMap).length >= 2
      ) {
        n += 1;
      }
    }
    return n;
  }, [topics, topicsSelectionMap]);

  const assembledPlain = useMemo(
    () => topics.map((t) => topicPlainText(t)).join("\n\n\n\n"),
    [topics],
  );

  const copyTopic = useCallback(async (t: EditionTopic) => {
    try {
      await navigator.clipboard.writeText(topicPlainText(t));
      setCopiedTopicId(t.id);
      window.setTimeout(() => setCopiedTopicId(null), 2000);
    } catch {
      setCopiedTopicId(null);
    }
  }, []);

  const copyAll = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(assembledPlain);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      setCopiedAll(false);
    }
  }, [assembledPlain]);

  const titleFr = editionTitleLine(date);

  const removeArticleMutation = useMutation({
    mutationFn: async ({
      topicId,
      articleId,
    }: {
      topicId: string;
      articleId: string;
    }) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      const cur = topicsSelectionMap[topicId] ?? [];
      const next = cur.filter((id) => id !== articleId);
      await api.editionTopicSelection(editionId, topicId, next);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const removeExtraArticleMutation = useMutation({
    mutationFn: async (articleId: string) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      const cur = selectionsQ.data?.extra_article_ids ?? [];
      await api.editionComposePreferences(editionId, {
        extra_selected_article_ids: cur.filter((id) => id !== articleId),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionSelections", editionId] });
    },
  });

  const reorderTopicsMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!editionId) {
        throw new Error("Édition introuvable");
      }
      for (let i = 0; i < orderedIds.length; i++) {
        const id = orderedIds[i];
        if (!id) {
          continue;
        }
        await api.editionTopicPatch(editionId, id, { user_rank: i });
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["editionTopics", editionId] });
    },
  });

  return (
    <div className="space-y-10">
      <nav className="text-[13px] text-muted-foreground">
        <Link
          href={`/edition/${date}`}
          className="underline-offset-4 hover:underline"
        >
          ← Retour au sommaire de l’édition
        </Link>
      </nav>

      <header className="space-y-4">
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold">
          Rédaction · {titleFr}
        </h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Articles sélectionnés",
              value: selectedIds.size,
            },
            { label: "Sujets", value: topics.length },
            {
              label: "Pays couverts",
              value: selectedCountryCodes.length,
            },
            {
              label: "Analyses disponibles",
              value: selectedAnalysisCount,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm"
            >
              <p className="text-[22px] font-semibold tabular-nums text-foreground">
                {kpi.value}
              </p>
              <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
            </div>
          ))}
        </div>
        {selectedIds.size === 0 ? (
          <div className="max-w-3xl rounded-lg border border-accent/20 bg-accent/5 px-4 py-4 text-[13px] leading-relaxed text-foreground-body">
            <p className="mb-3 font-semibold text-foreground">
              Parcours guidé (dans l’ordre)
            </p>
            <ol className="list-none space-y-3">
              <li className="flex gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground"
                  aria-hidden
                >
                  1
                </span>
                <span>
                  <strong className="text-foreground">Sélection</strong> : ordre des sujets (glisser-déposer) et articles cochés par sujet — au moins deux par bloc pour une génération fiable.
                </span>
              </li>
              <li className="flex gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground"
                  aria-hidden
                >
                  2
                </span>
                <span>
                  <strong className="text-foreground">Enrichissement</strong> : pour chaque sujet, vérifiez les extraits (thèse, résumé) ; les analyses détaillées sont dans la fiche article.
                </span>
              </li>
              <li className="flex gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground"
                  aria-hidden
                >
                  3
                </span>
                <span>
                  <strong className="text-foreground">Rédaction</strong> : consignes optionnelles puis « Rédiger ce bloc » ou génération globale — un texte par grand sujet.
                </span>
              </li>
              <li className="flex gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-background text-[12px] font-bold text-accent"
                  aria-hidden
                >
                  4
                </span>
                <span>
                  <strong className="text-foreground">Révision</strong> : copier-coller, export, relecture depuis les sections ci-dessous.
                </span>
              </li>
            </ol>
          </div>
        ) : (
          <p className="max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
            Sélection active : concentrez-vous sur l’ordre des articles, les consignes et la génération. Le parcours
            détaillé réapparaît si vous retirez toutes les coches depuis le sommaire.
          </p>
        )}
      </header>

      <section
        aria-labelledby="compose-selection-heading"
        className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
      >
        <h2
          id="compose-selection-heading"
          className="olj-rubric mb-3 border-b border-border-light pb-2"
        >
          Articles retenus ({selectedIds.size})
        </h2>
        {selectionsQ.isPending ? (
          <p className="text-[13px] text-muted-foreground">Chargement…</p>
        ) : selectedIds.size === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Aucune sélection : retournez au{" "}
            <Link href={`/edition/${date}`} className="olj-link-action">
              sommaire
            </Link>{" "}
            et cochez des articles sous les grands sujets (et sous les regroupements si besoin).
          </p>
        ) : (
          <div className="space-y-6">
            {selectionByTopic.map(({ topic, picked }) => {
              const reorderItems: ArticleReorderItem[] = picked.map((p) => ({
                id: p.id,
                label: p.media_name,
                meta: previewLine(p),
              }));
              return (
                <div key={topic.id}>
                  <p className="text-[12px] font-semibold text-foreground">
                    {topic.title_final ?? topic.title_proposed}
                  </p>
                  <div className="mt-2">
                    <ArticleReorderInTopic
                      items={reorderItems}
                      disabled={
                        !editionId ||
                        reorderArticlesMutation.isPending ||
                        removeArticleMutation.isPending
                      }
                      onOrderChange={(orderedIds) => {
                        reorderArticlesMutation.mutate({
                          topicId: topic.id,
                          orderedIds,
                        });
                      }}
                      onRemoveArticle={(articleId) => {
                        removeArticleMutation.mutate({
                          topicId: topic.id,
                          articleId,
                        });
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {extraOnlyPreviews.length > 0 ? (
              <div>
                <p className="text-[12px] font-semibold text-foreground">
                  Complément (regroupements)
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Ces coches renforcent la <strong className="font-medium text-foreground">couverture</strong> affichée sur le sommaire. La génération de texte utilise les articles <strong className="font-medium text-foreground">sélectionnés dans chaque grand sujet</strong> (au moins 2 par sujet).
                </p>
                <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {extraOnlyPreviews.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-2 text-[12px] leading-relaxed"
                    >
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">
                          {p.media_name}
                        </span>
                        {p.country_code ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · {p.country_code}
                          </span>
                        ) : null}
                        <br />
                        <span className="text-foreground-body">{previewLine(p)}</span>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                        disabled={removeExtraArticleMutation.isPending}
                        aria-label="Retirer cet article"
                        onClick={() => removeExtraArticleMutation.mutate(p.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <ComposeInstructions
        value={composeInstructions}
        onChange={onComposeInstructionsChange}
      />

      {topics.length > 1 ? (
        <TopicReorderList
          topics={topics}
          onOrderChange={(ids) => {
            reorderTopicsMutation.mutate(ids);
          }}
          disabled={reorderTopicsMutation.isPending}
          collapsible
        />
      ) : null}

      {selectedIds.size > 0 ? (
        <CoverageGaps
          selectedCountryCodes={selectedCountryCodes}
          targets={coverageQ.data ?? null}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="border border-foreground bg-foreground px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          disabled={
            !editionId ||
            genAllMutation.isPending ||
            topics.length === 0 ||
            topicsWithTwoPlusSelections === 0
          }
          onClick={() => void genAllMutation.mutateAsync()}
          title={
            topicsWithTwoPlusSelections === 0
              ? "Cochez au moins deux articles dans un ou plusieurs grands sujets au sommaire."
              : undefined
          }
        >
          {genAllMutation.isPending
            ? "Rédaction en cours…"
            : "Rédiger les articles sélectionnés"}
        </button>
        <button
          type="button"
          className="olj-btn-secondary px-4 py-2 text-[13px] disabled:opacity-50"
          disabled={topics.length === 0}
          onClick={() => void copyAll()}
        >
          {copiedAll ? "Copié" : "Copier toute la revue"}
        </button>
        <button
          type="button"
          className="olj-btn-secondary px-4 py-2 text-[13px]"
          onClick={() => void flushInstructions()}
        >
          Enregistrer les consignes
        </button>
        {genAllMutation.isError && (
          <span className="text-[12px] text-accent" role="alert" aria-live="polite">
            {(genAllMutation.error as Error)?.message ?? "Échec"}
          </span>
        )}
        {genAllMutation.isSuccess && genAllMutation.data?.status === "partial" && (
          <span className="text-[12px] text-warning">
            Partiel : certains sujets ont échoué.
          </span>
        )}
      </div>

      <section aria-labelledby="compose-topics-heading" className="space-y-10">
        <h2
          id="compose-topics-heading"
          className="olj-rubric border-b border-border pb-2"
        >
          Revue par article · grands sujets ({topics.length})
        </h2>
        {topics.map((t, idx) => {
          const rankLabel = t.user_rank ?? t.rank ?? idx + 1;
          const title = t.title_final ?? t.title_proposed;
          const previews = t.article_previews ?? [];
          const codes = new Set(
            previews
              .map((p) => (p.country_code ?? "").trim().toUpperCase())
              .filter(Boolean),
          );
          const nTexts = t.article_count ?? previews.length;
          const nCountries = codes.size;
          const hasGen = Boolean(t.generated_text?.trim());
          const orderedForTopic = orderedSelectedPreviewsForTopic(
            t,
            topicsSelectionMap,
          );
          const nSelectedInTopic = orderedForTopic.length;

          const canGenerateTopic = nSelectedInTopic >= 2;

          return (
            <article
              key={t.id}
              className={
                nSelectedInTopic === 0
                  ? "rounded-lg border border-dashed border-border bg-muted/15 p-5 opacity-90 shadow-sm sm:p-6"
                  : "rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
              }
            >
              <div className="mb-4 flex flex-col gap-4 border-b border-border-light pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Grand sujet {rankLabel} sur {topics.length}
                    </p>
                    <ReadinessIndicator
                      level={topicReadiness(orderedForTopic)}
                    />
                  </div>
                  <h3 className="mt-1 font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-snug text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {nTexts} texte{nTexts > 1 ? "s" : ""} lié{nTexts > 1 ? "s" : ""}
                    {nCountries > 0 ? ` · ${nCountries} pays` : ""}
                    {nSelectedInTopic > 0
                      ? ` · ${nSelectedInTopic} article${nSelectedInTopic > 1 ? "s" : ""} sélectionné${nSelectedInTopic > 1 ? "s" : ""} pour ce bloc`
                      : " · aucun article sélectionné — cochez au moins deux textes au sommaire"}
                  </p>
                  {nSelectedInTopic === 0 ? (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Retournez au{" "}
                      <Link href={`/edition/${date}`} className="olj-link-action">
                        sommaire
                      </Link>{" "}
                      pour cocher les articles à inclure dans la revue pour ce sujet.
                    </p>
                  ) : null}
                  {nSelectedInTopic === 1 ? (
                    <p className="mt-2 text-[12px] text-warning">
                      Cochez au moins un article de plus dans ce sujet (deux au minimum pour générer le bloc).
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="olj-btn-primary px-3 py-2 text-[12px] disabled:opacity-50"
                    disabled={
                      !editionId ||
                      genTopicMutation.isPending ||
                      !canGenerateTopic
                    }
                    onClick={() => {
                      setRegeneratingTopicId(t.id);
                      void genTopicMutation.mutateAsync({ topicId: t.id });
                    }}
                  >
                    {genTopicMutation.isPending && regeneratingTopicId === t.id
                      ? "Rédaction…"
                      : hasGen
                        ? "Rédiger à nouveau ce bloc"
                        : "Rédiger ce bloc"}
                  </button>
                  <button
                    type="button"
                    className="olj-btn-secondary px-3 py-2 text-[12px]"
                    onClick={() => void copyTopic(t)}
                  >
                    {copiedTopicId === t.id ? "Copié" : "Copier ce bloc"}
                  </button>
                </div>
              </div>

              {hasGen ? (
                <TopicGeneratedProse text={t.generated_text!} variant="compose" />
              ) : (
                <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-[14px] leading-relaxed text-muted-foreground">
                  Pas encore de texte : cochez au moins deux articles pour ce grand sujet au sommaire, puis cliquez sur « Rédiger ce bloc ».
                </p>
              )}
            </article>
          );
        })}
      </section>

      {topics.length === 0 && !topicsQ.isPending ? (
        <p className="text-[13px] text-muted-foreground">
          Aucun sujet pour cette édition. Lancez la détection des sujets depuis le sommaire.
        </p>
      ) : null}

      {genTopicMutation.isError ? (
        <p className="text-[12px] text-accent" role="alert">
          {(genTopicMutation.error as Error)?.message ??
            "Échec de la rédaction d’un sujet."}
        </p>
      ) : null}

      <footer className="space-y-4 border-t border-border-light pt-8">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="olj-btn-secondary px-4 py-2 text-[13px] disabled:opacity-50"
            disabled={topics.length === 0}
            onClick={() => void copyAll()}
          >
            {copiedAll ? "Copié" : "Copier toute la revue"}
          </button>
        </div>
        <CopyExportButtons text={assembledPlain} filename={`revue-${date}.txt`} />
      </footer>
    </div>
  );
}
