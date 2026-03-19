"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";
import { ConfidenceBadge } from "./confidence-badge";

interface ArticleCardProps {
  article: Article;
  selected: boolean;
  onToggle: (id: string) => void;
}

const EDITORIAL_TYPES = new Set(["opinion", "editorial", "tribune"]);

export function ArticleCard({ article, selected, onToggle }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isEditorial = EDITORIAL_TYPES.has(article.article_type || "");

  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const summaryPreview = article.summary_fr
    ? article.summary_fr.length > 180
      ? article.summary_fr.slice(0, 180) + "…"
      : article.summary_fr
    : null;

  return (
    <article
      className={`border-b border-border-light py-4 transition-colors ${
        selected ? "bg-accent/[0.03]" : ""
      } ${isEditorial ? "pl-0" : "pl-0"}`}
    >
      <div className="flex gap-3">
        <button
          onClick={() => onToggle(article.id)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className={`mt-1.5 flex h-[14px] w-[14px] flex-shrink-0 items-center justify-center border transition-colors ${
            selected
              ? "border-accent bg-accent"
              : "border-muted-foreground/40 hover:border-foreground"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2 w-2 text-white">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {isEditorial && (
                <span className="mb-0.5 inline-block text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
                  {article.article_type}
                </span>
              )}
              <h3
                className={`cursor-pointer leading-snug ${
                  isEditorial
                    ? "font-[family-name:var(--font-serif)] text-[17px] font-semibold"
                    : "text-[14px] font-medium"
                }`}
                onClick={() => setExpanded(!expanded)}
              >
                {article.title_fr || article.title_original}
              </h3>
            </div>
            <ConfidenceBadge score={article.translation_confidence} />
          </div>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground/70">{article.media_name}</span>
            <span>·</span>
            <span>{article.country}</span>
            {article.author && (
              <>
                <span>·</span>
                <span>{article.author}</span>
              </>
            )}
            {date && (
              <>
                <span>·</span>
                <span>{date}</span>
              </>
            )}
            {!isEditorial && article.article_type && (
              <span className="ml-1 border border-border-light px-1 py-px text-[10px] uppercase tracking-wider text-muted-foreground">
                {article.article_type}
              </span>
            )}
          </div>

          {summaryPreview && !expanded && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              {summaryPreview}
            </p>
          )}

          {expanded && (
            <div className="mt-3 space-y-2">
              {article.thesis_summary_fr && (
                <p className="font-[family-name:var(--font-serif)] text-[14px] italic text-foreground">
                  {article.thesis_summary_fr}
                </p>
              )}
              {article.summary_fr && (
                <p className="max-w-xl text-[13px] leading-[1.7] text-muted-foreground">
                  {article.summary_fr}
                </p>
              )}
              {article.key_quotes_fr && article.key_quotes_fr.length > 0 && (
                <div className="space-y-1 border-l-2 border-accent/30 pl-3">
                  {article.key_quotes_fr.map((q, i) => (
                    <p key={i} className="font-[family-name:var(--font-serif)] text-[13px] italic text-foreground/80">
                      «&nbsp;{q}&nbsp;»
                    </p>
                  ))}
                </div>
              )}
              {article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-accent underline underline-offset-2"
                >
                  Article original ↗
                </a>
              )}
            </div>
          )}

          {!expanded && summaryPreview && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              Lire plus
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
