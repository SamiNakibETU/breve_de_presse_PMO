"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";
import { ConfidenceBadge } from "./confidence-badge";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Check,
  Plus,
} from "lucide-react";

interface ArticleCardProps {
  article: Article;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function ArticleCard({ article, selected, onToggle }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);

  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={`rounded-lg border bg-card transition-colors ${
        selected ? "border-primary/50 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <button
          onClick={() => onToggle(article.id)}
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors ${
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:border-primary"
          }`}
        >
          {selected && <Check className="h-3 w-3" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-snug">
              {article.title_fr || article.title_original}
            </h3>
            <ConfidenceBadge score={article.translation_confidence} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">
              {article.media_name}
            </span>
            <span>{article.country}</span>
            {article.author && <span>{article.author}</span>}
            {date && <span>{date}</span>}
            {article.article_type && (
              <span className="rounded bg-muted px-1.5 py-0.5 capitalize">
                {article.article_type}
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-3 space-y-2 text-sm">
              {article.thesis_summary_fr && (
                <p>
                  <span className="font-medium">Thèse :</span>{" "}
                  {article.thesis_summary_fr}
                </p>
              )}
              {article.summary_fr && (
                <p className="text-muted-foreground">{article.summary_fr}</p>
              )}
              {article.key_quotes_fr && article.key_quotes_fr.length > 0 && (
                <div>
                  <span className="text-xs font-medium">Citations :</span>
                  {article.key_quotes_fr.map((q, i) => (
                    <p key={i} className="ml-2 italic text-muted-foreground">
                      {q}
                    </p>
                  ))}
                </div>
              )}
              {article.translation_notes && (
                <p className="text-xs text-warning">
                  Note : {article.translation_notes}
                </p>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Réduire
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> Détails
                </>
              )}
            </button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Original
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
