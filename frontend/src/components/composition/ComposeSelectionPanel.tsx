"use client";

import Link from "next/link";
import type { TopicArticlePreview, EditionTopic } from "@/lib/types";
import { ArticleReorderInTopic, type ArticleReorderItem } from "./ArticleReorderInTopic";

function previewLine(p: TopicArticlePreview): string {
  const t = (p.title_fr || p.title_original || "").trim();
  const th = (p.thesis_summary_fr || "").trim();
  if (th) {
    return th.length > 220 ? `${th.slice(0, 220)}…` : th;
  }
  return t || "—";
}

interface SelectionByTopic {
  topic: EditionTopic;
  picked: TopicArticlePreview[];
}

interface ComposeSelectionPanelProps {
  date: string;
  totalSelected: number;
  isLoading: boolean;
  selectionByTopic: SelectionByTopic[];
  extraOnlyPreviews: TopicArticlePreview[];
  reorderDisabled: boolean;
  removeDisabled: boolean;
  removeExtraDisabled: boolean;
  onOrderChange: (topicId: string, orderedIds: string[]) => void;
  onRemoveArticle: (topicId: string, articleId: string) => void;
  onRemoveExtra: (articleId: string) => void;
}

export function ComposeSelectionPanel({
  date,
  totalSelected,
  isLoading,
  selectionByTopic,
  extraOnlyPreviews,
  reorderDisabled,
  removeDisabled,
  removeExtraDisabled,
  onOrderChange,
  onRemoveArticle,
  onRemoveExtra,
}: ComposeSelectionPanelProps) {
  return (
    <section
      aria-labelledby="compose-selection-heading"
      className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <h2
        id="compose-selection-heading"
        className="olj-rubric mb-3 border-b border-border-light pb-2"
      >
        Articles retenus ({totalSelected})
      </h2>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Chargement…</p>
      ) : totalSelected === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucune sélection : retournez au{" "}
          <Link href={`/edition/${date}`} className="olj-link-action">
            sommaire
          </Link>{" "}
          et cochez des articles sous les grands sujets (et sous les regroupements si
          besoin).
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
                    disabled={reorderDisabled || removeDisabled}
                    onOrderChange={(orderedIds) => onOrderChange(topic.id, orderedIds)}
                    onRemoveArticle={(articleId) =>
                      onRemoveArticle(topic.id, articleId)
                    }
                  />
                </div>
              </div>
            );
          })}
          {extraOnlyPreviews.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-foreground">
                Complément (regroupements)
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Ces coches renforcent la{" "}
                <strong className="font-medium text-foreground">couverture</strong>{" "}
                affichée sur le sommaire. La génération de texte utilise les articles{" "}
                <strong className="font-medium text-foreground">
                  sélectionnés dans chaque grand sujet
                </strong>{" "}
                (au moins 2 par sujet).
              </p>
              <ul className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                {extraOnlyPreviews.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 text-[12px] leading-relaxed"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{p.media_name}</span>
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
                      disabled={removeExtraDisabled}
                      aria-label="Retirer cet article"
                      onClick={() => onRemoveExtra(p.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
