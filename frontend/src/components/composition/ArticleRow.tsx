"use client";

import { useState } from "react";
import { useArticleReader } from "@/contexts/article-reader";
import {
  FLAGSHIP_BADGE_LABEL,
  articleTypeLabelFr,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { formatDateTimeBeirutFr } from "@/lib/dates-display-fr";
import type { Article, TopicArticleRef } from "@/lib/types";

export function ArticleRow({
  article,
  selected,
  onSelectedChange,
  attachmentLabel,
  variant = "default",
  topicRef,
}: {
  article: Article;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
  /** Rattachement sujet / thème (corpus édition). */
  attachmentLabel?: string | null;
  /** `dense` : en-tête journal + pays + type mis en avant (grille corpus). `topicDetail` : fiche sujet enrichie. */
  variant?: "default" | "dense" | "topicDetail";
  /** Métadonnées de rattachement au sujet (GET topic detail). */
  topicRef?: TopicArticleRef | null;
}) {
  const { openArticle, prefetchArticle } = useArticleReader();
  const [open, setOpen] = useState(false);
  const title = article.title_fr || article.title_original;
  const cc = (article.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const typeFr = articleTypeLabelFr(article.article_type);

  const analysisCount = article.analysis_bullets_fr?.length ?? 0;
  const topicDetailChips =
    variant === "topicDetail" ? (
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
        {article.editorial_relevance != null ? (
          <span className="rounded border border-border-light bg-muted/20 px-1.5 py-0.5 tabular-nums">
            Pertinence {article.editorial_relevance.toFixed(2)}
          </span>
        ) : null}
        {article.translation_confidence != null ? (
          <span className="rounded border border-border-light bg-muted/20 px-1.5 py-0.5 tabular-nums">
            Trad. {Math.round(article.translation_confidence * 100)}%
          </span>
        ) : null}
        <span className="rounded border border-border-light bg-muted/20 px-1.5 py-0.5">
          Collecte {formatDateTimeBeirutFr(article.collected_at)}
        </span>
        {article.source_language ? (
          <span className="rounded border border-border-light bg-muted/20 px-1.5 py-0.5 uppercase">
            {article.source_language}
          </span>
        ) : null}
        {analysisCount > 0 ? (
          <span className="rounded border border-border-light bg-muted/20 px-1.5 py-0.5 tabular-nums">
            {analysisCount} puce{analysisCount > 1 ? "s" : ""} analyse
          </span>
        ) : null}
        {topicRef?.fit_confidence != null ? (
          <span className="rounded border border-border-light bg-muted/20 px-1.5 py-0.5 tabular-nums">
            Adéquation sujet {topicRef.fit_confidence.toFixed(2)}
          </span>
        ) : null}
        {topicRef?.is_recommended ? (
          <span className="rounded border border-info/30 bg-info/10 px-1.5 py-0.5 font-medium text-foreground-body">
            Regard mis en avant
          </span>
        ) : null}
      </div>
    ) : null;

  const metaDense = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {flag || cc ? (
        <span className="inline-flex items-center rounded border border-border-light bg-surface px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {flag ? <span className="mr-1">{flag}</span> : null}
          {cc || "—"}
        </span>
      ) : null}
      <span className="text-[11px] font-semibold text-foreground">
        {article.media_name}
      </span>
      {article.country?.trim() ? (
        <span className="text-[11px] text-muted-foreground">
          {article.country.trim()}
        </span>
      ) : null}
      {typeFr ? (
        <span className="rounded-sm bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-body">
          {typeFr}
        </span>
      ) : null}
      {article.author?.trim() ? (
        <span className="text-[11px] text-muted-foreground">· {article.author.trim()}</span>
      ) : null}
    </div>
  );

  return (
    <div
      className={
        variant === "topicDetail"
          ? "border-b border-border-light py-3 text-[13px]"
          : variant === "dense"
            ? "text-[13px]"
            : "border-b border-border-light py-3 text-[13px]"
      }
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1.5 size-[15px] shrink-0 rounded-sm border-border"
          checked={selected}
          onChange={(e) => onSelectedChange(e.target.checked)}
          aria-label={`Inclure ${title}`}
        />
        <button
          type="button"
          className="olj-focus min-w-0 flex-1 rounded-sm text-left focus:outline-none"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {variant === "dense" || variant === "topicDetail" ? (
            <div className="space-y-1">{metaDense}</div>
          ) : null}
          <span
            className={
              variant === "dense" || variant === "topicDetail"
                ? "mt-1 block font-[family-name:var(--font-serif)] text-[14px] font-medium leading-snug text-foreground"
                : "font-medium leading-snug text-foreground"
            }
          >
            {title}
          </span>
          {variant === "topicDetail" ? topicDetailChips : null}
          {article.thesis_summary_fr && (
            <p
              className={
                variant === "dense" || variant === "topicDetail"
                  ? "mt-1.5 line-clamp-2 font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body"
                  : "mt-1.5 italic leading-relaxed text-foreground-body"
              }
            >
              {article.thesis_summary_fr}
            </p>
          )}
          {variant === "default" ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span>
                {formatArticleMetaLine({
                  mediaName: article.media_name,
                  country: article.country,
                  articleType: article.article_type,
                  sourceLanguage: article.source_language,
                  author: article.author,
                })}
              </span>
              {article.editorial_angle && (
                <span className="block w-full text-[11px] leading-snug text-foreground-subtle">
                  {article.editorial_angle}
                </span>
              )}
              {article.is_flagship ? (
                <span className="inline-flex rounded-full border border-accent/35 bg-accent/5 px-2 py-0.5 text-[11px] font-semibold text-accent">
                  {FLAGSHIP_BADGE_LABEL}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {article.editorial_angle ? (
                <span className="text-[10px] leading-snug text-foreground-subtle line-clamp-1">
                  {article.editorial_angle}
                </span>
              ) : null}
              {article.is_flagship ? (
                <span className="inline-flex rounded-full border border-accent/35 bg-accent/5 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {FLAGSHIP_BADGE_LABEL}
                </span>
              ) : null}
            </div>
          )}
        </button>
        <div className="mt-1 flex shrink-0 flex-col items-end gap-1 self-start">
          <button
            type="button"
            className="olj-btn-secondary px-2 py-0.5 text-[10px]"
            onMouseEnter={() => prefetchArticle(article.id)}
            onFocus={() => prefetchArticle(article.id)}
            onClick={(e) => {
              e.stopPropagation();
              openArticle(article.id);
            }}
          >
            Lire
          </button>
          {article.url ? (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="olj-focus text-[11px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              Source ↗
            </a>
          ) : null}
        </div>
      </div>
      {attachmentLabel ? (
        <p className="mt-2 pl-8 text-[10px] font-medium uppercase tracking-wide text-info">
          {attachmentLabel}
        </p>
      ) : null}
      {open && article.summary_fr && (
        <div className="mt-3 max-w-2xl space-y-2 rounded-md bg-muted/15 px-3 py-2 text-[13px] leading-relaxed text-foreground-body">
          <p>{article.summary_fr}</p>
          {variant === "topicDetail" &&
          article.analysis_bullets_fr &&
          article.analysis_bullets_fr.length > 0 ? (
            <ul className="list-inside list-decimal space-y-1 border-t border-border/40 pt-2 text-[12px] text-foreground-body">
              {article.analysis_bullets_fr.slice(0, 3).map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
