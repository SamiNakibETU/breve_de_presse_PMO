"use client";

import Link from "next/link";
import type { EditionTopic, TopicArticlePreview } from "@/lib/types";
import { ReadinessIndicator, type ReadinessLevel } from "./ReadinessIndicator";
import { TopicGeneratedProse } from "./TopicGeneratedProse";

function previewLine(p: TopicArticlePreview): string {
  const t = (p.title_fr || p.title_original || "").trim();
  const th = (p.thesis_summary_fr || "").trim();
  if (th) {
    return th.length > 220 ? `${th.slice(0, 220)}…` : th;
  }
  return t || "—";
}

function topicReadiness(ordered: TopicArticlePreview[]): ReadinessLevel {
  if (ordered.length === 0) return "empty";
  if (ordered.length < 2) return "warn";
  const readyCount = ordered.filter(
    (p) => Boolean((p.summary_fr ?? "").trim()) && p.has_full_translation_fr === true,
  ).length;
  return readyCount >= 2 ? "ok" : "warn";
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
}: ComposeTopicsPanelProps) {
  if (isLoadingTopics) {
    return <p className="text-[13px] text-muted-foreground">Chargement des sujets…</p>;
  }

  return (
    <section aria-labelledby="compose-topics-heading" className="space-y-10">
      <h2
        id="compose-topics-heading"
        className="olj-rubric border-b border-border pb-2"
      >
        Revue par article · grands sujets ({topics.length})
      </h2>

      {topics.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Aucun sujet pour cette édition. Lancez la détection des sujets depuis le
          sommaire.
        </p>
      ) : (
        topics.map((t, idx) => {
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
          const orderedForTopic = orderedSelectedPreviews(t, topicsSelectionMap);
          const nSelected = orderedForTopic.length;
          const canGenerate = nSelected >= 2;

          return (
            <article
              key={t.id}
              className={
                nSelected === 0
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
                    <ReadinessIndicator level={topicReadiness(orderedForTopic)} />
                  </div>
                  <h3 className="mt-1 font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-snug text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {nTexts} texte{nTexts > 1 ? "s" : ""} lié{nTexts > 1 ? "s" : ""}
                    {nCountries > 0 ? ` · ${nCountries} pays` : ""}
                    {nSelected > 0
                      ? ` · ${nSelected} article${nSelected > 1 ? "s" : ""} sélectionné${nSelected > 1 ? "s" : ""} pour ce bloc`
                      : " · aucun article sélectionné — cochez au moins deux textes au sommaire"}
                  </p>
                  {nSelected === 0 && (
                    <p className="mt-2 text-[12px] text-muted-foreground">
                      Retournez au{" "}
                      <Link href={`/edition/${date}`} className="olj-link-action">
                        sommaire
                      </Link>{" "}
                      pour cocher les articles à inclure dans la revue pour ce sujet.
                    </p>
                  )}
                  {nSelected === 1 && (
                    <p className="mt-2 text-[12px] text-warning">
                      Cochez au moins un article de plus dans ce sujet (deux au minimum
                      pour générer le bloc).
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    className="olj-btn-primary px-3 py-2 text-[12px] disabled:opacity-50"
                    disabled={isGeneratingTopic || !canGenerate}
                    onClick={() => onGenerateTopic(t.id)}
                  >
                    {isGeneratingTopic && regeneratingTopicId === t.id
                      ? "Rédaction…"
                      : hasGen
                        ? "Rédiger à nouveau ce bloc"
                        : "Rédiger ce bloc"}
                  </button>
                  <button
                    type="button"
                    className="olj-btn-secondary px-3 py-2 text-[12px]"
                    onClick={() => onCopyTopic(t)}
                  >
                    {copiedTopicId === t.id ? "Copié" : "Copier ce bloc"}
                  </button>
                </div>
              </div>

              {hasGen ? (
                <TopicGeneratedProse text={t.generated_text!} variant="compose" />
              ) : (
                <p className="rounded-md border border-dashed border-border bg-muted/10 p-4 text-[14px] leading-relaxed text-muted-foreground">
                  Pas encore de texte : cochez au moins deux articles pour ce grand sujet
                  au sommaire, puis cliquez sur « Rédiger ce bloc ».
                </p>
              )}
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
