"use client";

import Link from "next/link";
import type { EditionTopic, TopicArticlePreview } from "@/lib/types";
import { formatIsoCalendarDayLongFr } from "@/lib/dates-display-fr";
import { ReadinessIndicator, type ReadinessLevel } from "./ReadinessIndicator";
import { TopicGeneratedProse } from "./TopicGeneratedProse";
import { useArticleReader } from "@/contexts/article-reader";

function topicReadiness(ordered: TopicArticlePreview[]): ReadinessLevel {
  if (ordered.length === 0) return "empty";
  if (ordered.length < 2) return "warn";
  const readyCount = ordered.filter(
    (p) => Boolean((p.summary_fr ?? "").trim()) && p.has_full_translation_fr === true,
  ).length;
  return readyCount >= 2 ? "ok" : "warn";
}

function scorePreviewForReco(p: TopicArticlePreview): number {
  let s = 0;
  if (p.editorial_relevance != null) s += p.editorial_relevance * 4;
  if (p.has_full_translation_fr) s += 5;
  if (p.is_flagship) s += 2;
  if (p.analysis_bullets_fr && p.analysis_bullets_fr.length > 0) s += 2;
  return s;
}

function recommendedUnselectedForTopic(
  topic: EditionTopic,
  map: Record<string, string[]>,
  limit: number,
): TopicArticlePreview[] {
  const selected = new Set(map[topic.id] ?? []);
  const pool = (topic.article_previews ?? []).filter((p) => !selected.has(p.id));
  return [...pool]
    .sort((a, b) => scorePreviewForReco(b) - scorePreviewForReco(a))
    .slice(0, limit);
}

function shortArticleTitle(p: TopicArticlePreview): string {
  const t = (p.title_fr || p.title_original || "").trim() || "Sans titre";
  return t.length > 72 ? `${t.slice(0, 72)}…` : t;
}

interface ComposeTopicsPanelProps {
  date: string;
  topics: EditionTopic[];
  topicsSelectionMap: Record<string, string[]>;
  isLoadingTopics: boolean;
  regeneratingTopicId: string | null;
  copiedTopicId: string | null;
  isGeneratingTopic: boolean;
  isGenerateTopicError: boolean;
  generateTopicErrorMessage: string;
  onGenerateTopic: (topicId: string) => void;
  onCopyTopic: (topic: EditionTopic) => void;
  /** Ajouter un article « piste » à la sélection d'un sujet. */
  onAddPiste?: (topicId: string, articleId: string) => void;
  addPisteDisabled?: boolean;
}

function orderedSelectedPreviews(
  topic: EditionTopic,
  map: Record<string, string[]>,
): TopicArticlePreview[] {
  const ids = map[topic.id] ?? [];
  const byId = new Map((topic.article_previews ?? []).map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is TopicArticlePreview => Boolean(p));
}

export function ComposeTopicsPanel({
  date,
  topics,
  topicsSelectionMap,
  isLoadingTopics,
  regeneratingTopicId,
  copiedTopicId,
  isGeneratingTopic,
  isGenerateTopicError,
  generateTopicErrorMessage,
  onGenerateTopic,
  onCopyTopic,
  onAddPiste,
  addPisteDisabled,
}: ComposeTopicsPanelProps) {
  const { openArticle, prefetchArticle } = useArticleReader();

  if (isLoadingTopics) {
    return <p className="text-[13px] text-muted-foreground">Chargement des sujets…</p>;
  }

  return (
    <section aria-labelledby="compose-topics-heading" className="space-y-6">
      <h2
        id="compose-topics-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
      >
        Textes par sujet ({topics.length})
      </h2>

      {topics.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Aucun sujet pour cette édition. Lancez la détection des sujets depuis le sommaire.
        </p>
      ) : (
        topics.map((t, idx) => {
          const position = idx + 1;
          const title = t.title_final ?? t.title_proposed;
          const previews = t.article_previews ?? [];
          const codes = new Set(
            previews.map((p) => (p.country_code ?? "").trim().toUpperCase()).filter(Boolean),
          );
          const nTexts = t.article_count ?? previews.length;
          const nCountries = codes.size;
          const hasGen = Boolean(t.generated_text?.trim());
          const orderedForTopic = orderedSelectedPreviews(t, topicsSelectionMap);
          const nSelected = orderedForTopic.length;
          const canGenerate = nSelected >= 2;
          const reco = recommendedUnselectedForTopic(t, topicsSelectionMap, 8);

          return (
            <article
              id={`compose-topic-${t.id}`}
              key={t.id}
              className="scroll-mt-28 rounded-2xl border border-border/55 bg-card p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-5"
            >
              {/* ── Header sujet ── */}
              <div className="flex flex-col gap-3 border-b border-border/40 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums text-[11px] font-semibold text-muted-foreground">
                      {position}/{topics.length}
                    </span>
                    <ReadinessIndicator level={topicReadiness(orderedForTopic)} />
                  </div>
                  <h3 className="mt-1 font-[family-name:var(--font-serif)] text-[17px] font-semibold leading-snug text-foreground sm:text-[18px]">
                    {title}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {nTexts} texte{nTexts > 1 ? "s" : ""}
                    {nCountries > 0 ? ` · ${nCountries} pays` : ""}
                    {nSelected > 0
                      ? ` · ${nSelected} retenu${nSelected > 1 ? "s" : ""}`
                      : " · aucune sélection"}
                  </p>
                  {nSelected === 1 && (
                    <p className="mt-1.5 text-[11px] text-warning">
                      Un article de plus (min. 2) pour pouvoir rédiger.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
                  <button
                    type="button"
                    className="olj-btn-primary px-3 py-1.5 text-[12px] disabled:opacity-50"
                    disabled={isGeneratingTopic || !canGenerate}
                    onClick={() => onGenerateTopic(t.id)}
                  >
                    {isGeneratingTopic && regeneratingTopicId === t.id
                      ? "Rédaction…"
                      : hasGen
                        ? "Régénérer"
                        : "Rédiger"}
                  </button>
                  <button
                    type="button"
                    className="olj-btn-secondary px-3 py-1.5 text-[12px]"
                    onClick={() => onCopyTopic(t)}
                  >
                    {copiedTopicId === t.id ? "Copié ✓" : "Copier"}
                  </button>
                </div>
              </div>

              {/* ── Pistes (articles non sélectionnés recommandés) ── */}
              {reco.length > 0 && nSelected < 2 ? (
                <div className="mt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Suggestions
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Corpus du{" "}
                    <span className="font-medium text-foreground-body">
                      {formatIsoCalendarDayLongFr(date)}
                    </span>
                    . Cliquez pour lire · « + » pour retenir · ou{" "}
                    <Link href={`/edition/${date}`} className="olj-link-action">
                      sommaire
                    </Link>
                    .
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {reco.map((p) => (
                      <li key={p.id} className="flex min-w-0 items-center gap-1.5">
                        {/* Bouton lire */}
                        <button
                          type="button"
                          className="olj-focus min-w-0 flex-1 truncate rounded-md border border-border/55 bg-muted/15 px-2 py-1 text-left text-[11px] text-foreground transition-colors hover:border-accent/40 hover:bg-muted/25"
                          title={shortArticleTitle(p)}
                          onMouseEnter={() => prefetchArticle(p.id)}
                          onClick={() => openArticle(p.id)}
                        >
                          <span className="text-muted-foreground">{p.media_name}</span>
                          <span className="mx-1 text-border">·</span>
                          <span>{shortArticleTitle(p)}</span>
                        </button>
                        {/* Bouton Retenir */}
                        {onAddPiste && (
                          <button
                            type="button"
                            title="Retenir cet article dans ce sujet"
                            disabled={addPisteDisabled}
                            className="shrink-0 rounded-md border border-border/55 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent disabled:opacity-40"
                            onClick={() => onAddPiste(t.id, p.id)}
                          >
                            +
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* ── Texte généré ── */}
              <div className="mt-4">
                {hasGen ? (
                  <TopicGeneratedProse text={t.generated_text!} variant="compose" />
                ) : (
                  <p className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                    Sélectionnez au moins deux articles au sommaire ou via les suggestions ci-dessus, puis « Rédiger ».
                  </p>
                )}
              </div>
            </article>
          );
        })
      )}

      {isGenerateTopicError && (
        <p className="text-[12px] text-accent" role="alert">
          {generateTopicErrorMessage || "Échec de la rédaction d'un sujet."}
        </p>
      )}
    </section>
  );
}
