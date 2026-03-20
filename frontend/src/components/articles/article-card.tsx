"use client";

import { useState } from "react";
import type { Article } from "@/lib/types";
import { RelevanceBadge, ConfidenceBadge } from "./confidence-badge";

interface ArticleCardProps {
  article: Article;
  selected: boolean;
  onToggle: (id: string) => void;
}

const EDITORIAL_TYPES = new Set(["opinion", "editorial", "tribune"]);

const TYPE_LABELS: Record<string, string> = {
  opinion: "Opinion",
  editorial: "Éditorial",
  tribune: "Tribune",
  analysis: "Analyse",
  news: "News",
  interview: "Interview",
  reportage: "Reportage",
};

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
    ? article.summary_fr.length > 200
      ? article.summary_fr.slice(0, 200) + "…"
      : article.summary_fr
    : null;

  return (
    <article className={`border-b border-[#eeede9] py-4 ${selected ? "bg-[#fef8f8]" : ""}`}>
      <div className="flex gap-3">
        <button
          onClick={() => onToggle(article.id)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className={`mt-1.5 flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center border transition-colors ${
            selected ? "border-[#c8102e] bg-[#c8102e]" : "border-[#ccc] hover:border-[#1a1a1a]"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {isEditorial && article.article_type && (
                <span className="mb-0.5 inline-block text-[10px] font-bold uppercase tracking-[0.12em] text-[#c8102e]">
                  {TYPE_LABELS[article.article_type] || article.article_type}
                </span>
              )}
              <h3
                className={`cursor-pointer leading-snug hover:text-[#c8102e] ${
                  isEditorial
                    ? "font-[family-name:var(--font-serif)] text-[17px]"
                    : "text-[14px] font-medium"
                }`}
                onClick={() => setExpanded(!expanded)}
              >
                {article.title_fr || article.title_original}
              </h3>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span
                title={
                  article.why_ranked
                    ? `Pertinence : base ${(article.why_ranked as { base_score?: number }).base_score ?? "—"} + bonus thèmes du jour ${(article.why_ranked as { topic_of_day_bonus?: number }).topic_of_day_bonus ?? 0}. Pays : ${(article.why_ranked as { factors?: { country_code?: string } }).factors?.country_code ?? "—"}`
                    : "Score éditorial OLJ"
                }
                className="cursor-help"
              >
                <RelevanceBadge score={article.editorial_relevance} />
              </span>
              <ConfidenceBadge score={article.translation_confidence} />
            </div>
          </div>

          {(article.status === "error" ||
            article.status === "translation_abandoned") &&
            article.processing_error && (
              <p className="mt-1 line-clamp-2 font-mono text-[10px] text-[#c8102e]">
                {article.processing_error}
              </p>
            )}

          {article.olj_topic_ids && article.olj_topic_ids.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {article.olj_topic_ids.map((tid) => (
                <span
                  key={tid}
                  className="rounded border border-[#e8e4df] bg-[#faf9f7] px-1.5 py-px font-mono text-[9px] text-[#666]"
                >
                  {tid}
                </span>
              ))}
            </p>
          )}

          <p className="mt-1 text-[12px] text-[#888]">
            {article.media_name}
            <span className="mx-1">·</span>
            {article.country}
            {article.author && <><span className="mx-1">·</span>{article.author}</>}
            {date && <><span className="mx-1">·</span>{date}</>}
            {!isEditorial && article.article_type && (
              <span className="ml-2 border border-[#eeede9] px-1 py-px text-[10px] uppercase tracking-wider text-[#aaa]">
                {TYPE_LABELS[article.article_type] || article.article_type}
              </span>
            )}
          </p>

          {summaryPreview && !expanded && (
            <p
              className="mt-2 cursor-pointer text-[13px] leading-relaxed text-[#555]"
              onClick={() => setExpanded(true)}
            >
              {summaryPreview}
            </p>
          )}

          {expanded && (
            <div className="mt-3 space-y-2">
              {article.thesis_summary_fr && (
                <p className="font-[family-name:var(--font-serif)] text-[14px] italic text-[#333]">
                  {article.thesis_summary_fr}
                </p>
              )}
              {article.summary_fr && (
                <p className="max-w-2xl text-[13px] leading-[1.7] text-[#555]">
                  {article.summary_fr}
                </p>
              )}
              {article.key_quotes_fr && article.key_quotes_fr.length > 0 && (
                <div className="space-y-1 border-l-2 border-[#c8102e]/20 pl-3">
                  {article.key_quotes_fr.map((q, i) => (
                    <p key={i} className="font-[family-name:var(--font-serif)] text-[13px] italic text-[#444]">
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
                  className="text-[11px] text-[#888] underline decoration-[#ddd] underline-offset-2 hover:text-[#1a1a1a]"
                >
                  Article original ↗
                </a>
              )}
              <button
                onClick={() => setExpanded(false)}
                className="block text-[11px] text-[#888] hover:text-[#1a1a1a]"
              >
                Réduire
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
