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
/** News / reportage / interview : hiérarchie visuelle plus discrète (MEMW §2.5.4) */
const NEWS_LIKE_TYPES = new Set(["news", "reportage", "interview"]);

const TYPE_LABELS: Record<string, string> = {
  opinion: "Opinion",
  editorial: "Éditorial",
  tribune: "Tribune",
  analysis: "Analyse",
  news: "News",
  interview: "Interview",
  reportage: "Reportage",
};

/** Seuils alignés sur cod_multi_pass_min_relevance (80) — sans afficher le score (MEMW §2.5.4). */
function editorialRelevanceLabel(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 80) return "Très pertinent";
  if (score >= 50) return "Pertinent";
  return null;
}

export function ArticleCard({ article, selected, onToggle }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isEditorial = EDITORIAL_TYPES.has(article.article_type || "");
  const isNewsLike = NEWS_LIKE_TYPES.has(article.article_type || "");
  const relevanceLabel = editorialRelevanceLabel(article.editorial_relevance);

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
              <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {(isEditorial || isNewsLike) && article.article_type && (
                  <span
                    className={`inline-block text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isEditorial ? "text-[#c8102e]" : "text-[#aaa]"
                    }`}
                  >
                    {TYPE_LABELS[article.article_type] || article.article_type}
                  </span>
                )}
                {relevanceLabel && (
                  <span className="text-[10px] font-normal normal-case tracking-normal text-[#b0b0b0]">
                    {relevanceLabel}
                  </span>
                )}
              </div>
              <h3
                className={`cursor-pointer leading-snug hover:text-[#c8102e] ${
                  isEditorial
                    ? "font-[family-name:var(--font-serif)] text-[17px] font-normal"
                    : isNewsLike
                      ? "text-[13px] font-normal text-[#888]"
                      : "text-[14px] font-medium"
                }`}
                onClick={() => setExpanded(!expanded)}
              >
                {article.title_fr || article.title_original}
              </h3>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              {article.translation_confidence != null &&
                article.translation_confidence < 0.7 && (
                  <ConfidenceBadge score={article.translation_confidence} />
                )}
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
            {article.is_syndicated && (
              <span className="ml-2 text-[10px] text-[#888]">Reprise</span>
            )}
            {article.syndicate_siblings_count != null &&
              article.syndicate_siblings_count > 0 && (
                <span className="ml-2 text-[10px] text-[#888]">
                  +{article.syndicate_siblings_count} reprise
                  {article.syndicate_siblings_count > 1 ? "s" : ""}
                </span>
              )}
          </p>

          {article.en_translation_summary_only && (
            <p className="mt-1 text-[11px] text-[#999]">
              Corps conservé en langue d’origine (anglais).
            </p>
          )}

          {article.thesis_summary_fr && !expanded && (
            <p className="mt-2 line-clamp-2 font-[family-name:var(--font-serif)] text-[14px] italic leading-snug text-[#333]">
              «&nbsp;{article.thesis_summary_fr}&nbsp;»
            </p>
          )}

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
