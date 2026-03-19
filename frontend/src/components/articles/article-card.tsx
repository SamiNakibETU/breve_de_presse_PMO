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
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <article
      className={`border-b border-border-light transition-colors ${
        selected ? "bg-accent/[0.04]" : ""
      }`}
    >
      <div className="flex items-start gap-3 py-3">
        <button
          onClick={() => onToggle(article.id)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className={`mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center border transition-colors ${
            selected
              ? "border-accent bg-accent"
              : "border-border hover:border-foreground"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white">
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
          <div className="flex items-start justify-between gap-4">
            <h3
              className="cursor-pointer text-[14px] font-semibold leading-snug text-foreground hover:text-accent"
              onClick={() => setExpanded(!expanded)}
            >
              {article.title_fr || article.title_original}
            </h3>
            <ConfidenceBadge score={article.translation_confidence} />
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {article.media_name}
            </span>
            <span className="text-border">&mdash;</span>
            <span>{article.country}</span>
            {article.author && (
              <>
                <span className="text-border">&mdash;</span>
                <span>{article.author}</span>
              </>
            )}
            {date && (
              <>
                <span className="text-border">&mdash;</span>
                <span>{date}</span>
              </>
            )}
            {article.article_type && (
              <span className="ml-1 border border-border-light px-1.5 py-px text-[11px] uppercase tracking-wider">
                {article.article_type}
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-3 max-w-[var(--max-width-reading)] space-y-3 border-l-2 border-border pl-4">
              {article.thesis_summary_fr && (
                <p className="text-[13px] font-medium italic text-foreground">
                  {article.thesis_summary_fr}
                </p>
              )}
              {article.summary_fr && (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
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
                  className="inline-block text-[12px] text-accent underline underline-offset-2"
                >
                  Article original ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
