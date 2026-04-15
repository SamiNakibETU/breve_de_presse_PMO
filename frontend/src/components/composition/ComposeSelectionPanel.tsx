"use client";

import Link from "next/link";
import type { TopicArticlePreview, EditionTopic } from "@/lib/types";
import { ArticleReorderInTopic, type ArticleReorderItem } from "./ArticleReorderInTopic";
import { UI_SURFACE_INSET, UI_SURFACE_INSET_PAD } from "@/lib/ui-surface-classes";

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
      className={`rounded-2xl border border-border/50 bg-card ${UI_SURFACE_INSET_PAD} shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-6`}
    >
      <h2
        id="compose-selection-heading"
        className="mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
      >
        Articles retenus ·{" "}
        <span className="tabular-nums text-foreground">{totalSelected}</span>
      </h2>
      {isLoading ? (
        <p className="text-[13px] text-muted-foreground">Chargement…</p>
      ) : totalSelected === 0 ? (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucun article pour l’instant —{" "}
          <Link href={`/edition/${date}`} className="olj-link-action">
            sommaire
          </Link>
          .
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
                <p className="text-[12px] font-medium text-foreground">
                  {topic.title_final ?? topic.title_proposed}
                </p>
                <div className="mt-2">
                  <ArticleReorderInTopic
                    items={reorderItems}
                    disabled={reorderDisabled || removeDisabled}
                    onOrderChange={(orderedIds) => onOrderChange(topic.id, orderedIds)}
                    onRemoveArticle={(articleId) => onRemoveArticle(topic.id, articleId)}
                  />
                </div>
              </div>
            );
          })}
          {extraOnlyPreviews.length > 0 && (
            <div className={`${UI_SURFACE_INSET} ${UI_SURFACE_INSET_PAD}`}>
              <p className="text-[12px] font-medium text-foreground">Complément (regroupements)</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Renforce la couverture affichée au sommaire. La génération utilise surtout les articles
                cochés dans chaque grand sujet (deux minimum par sujet).
              </p>
              <ul className="mt-3 space-y-2">
                {extraOnlyPreviews.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 border-b border-border/30 pb-2 text-[12px] last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{p.media_name}</span>
                      {p.country_code ? (
                        <span className="text-muted-foreground"> · {p.country_code}</span>
                      ) : null}
                      <br />
                      <span className="text-foreground-body">{previewLine(p)}</span>
                    </div>
                    <button
                      type="button"
                      className="olj-focus shrink-0 rounded-md border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
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
