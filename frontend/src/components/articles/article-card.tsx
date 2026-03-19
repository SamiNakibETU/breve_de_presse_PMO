"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";
import { ConfidenceBadge } from "./confidence-badge";

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
    <article
      className={`border-b border-border-light/60 py-4 transition-colors ${
        selected ? "bg-muted/30" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <button
          onClick={() => onToggle(article.id)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className={`mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center border transition-colors ${
            selected
              ? "border-foreground bg-foreground"
              : "border-border hover:border-foreground/50"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2 w-2 text-background">
              <path
                d="M2 6l3 3 5-5"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
              />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <h3
            className="cursor-pointer font-serif text-[15px] font-medium leading-snug text-foreground hover:underline"
            onClick={() => setExpanded(!expanded)}
          >
            {article.title_fr || article.title_original}
          </h3>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] tracking-wide text-muted-foreground">
            <span className="text-foreground/90">{article.media_name}</span>
            <span aria-hidden>·</span>
            <span>{article.country}</span>
            {article.author && (
              <>
                <span aria-hidden>·</span>
                <span>{article.author}</span>
              </>
            )}
            {date && (
              <>
                <span aria-hidden>·</span>
                <span>{date}</span>
              </>
            )}
            {article.article_type && (
              <>
                <span aria-hidden>·</span>
                <span className="uppercase">{article.article_type}</span>
              </>
            )}
            <span className="ml-auto">
              <ConfidenceBadge score={article.translation_confidence} />
            </span>
          </div>

          {expanded && (
            <div className="mt-4 max-w-[var(--max-width-reading)] space-y-3 border-l border-border-light/80 pl-5">
              {article.thesis_summary_fr && (
                <p className="font-serif text-[13px] font-medium italic leading-relaxed text-foreground">
                  {article.thesis_summary_fr}
                </p>
              )}
              {article.summary_fr && (
                <p className="text-[13px] leading-[1.6] text-muted-foreground">
                  {article.summary_fr}
                </p>
              )}
              {article.key_quotes_fr && article.key_quotes_fr.length > 0 && (
                <div className="space-y-1">
                  {article.key_quotes_fr.map((q, i) => (
                    <p
                      key={i}
                      className="text-[13px] italic text-muted-foreground before:content-['«\00a0'] after:content-['\00a0»']"
                    >
                      {q}
                    </p>
                  ))}
                </div>
              )}
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-foreground underline underline-offset-2 hover:text-accent"
                >
                  Source ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
