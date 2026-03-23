"use client";

import { useState } from "react";
import { useArticleReader } from "@/contexts/article-reader";
import {
  FLAGSHIP_BADGE_LABEL,
  articleTypeLabelFr,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type { Article } from "@/lib/types";

export function ArticleRow({
  article,
  selected,
  onSelectedChange,
  attachmentLabel,
  variant = "default",
}: {
  article: Article;
  selected: boolean;
  onSelectedChange: (next: boolean) => void;
  /** Rattachement sujet / thème (corpus édition). */
  attachmentLabel?: string | null;
  /** `dense` : en-tête journal + pays + type mis en avant (grille corpus). */
  variant?: "default" | "dense";
}) {
  const openArticle = useArticleReader();
  const [open, setOpen] = useState(false);
  const title = article.title_fr || article.title_original;
  const cc = (article.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const typeFr = articleTypeLabelFr(article.article_type);

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
    </div>
  );

  return (
    <div
      className={
        variant === "dense"
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
          {variant === "dense" ? (
            <div className="space-y-1">{metaDense}</div>
          ) : null}
          <span
            className={
              variant === "dense"
                ? "mt-1 block font-[family-name:var(--font-serif)] text-[14px] font-medium leading-snug text-foreground"
                : "font-medium leading-snug text-foreground"
            }
          >
            {title}
          </span>
          {article.thesis_summary_fr && (
            <p
              className={
                variant === "dense"
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
                })}
              </span>
              {article.editorial_angle && (
                <span className="block w-full text-[11px] leading-snug text-foreground-subtle">
                  {article.editorial_angle}
                </span>
              )}
              {article.is_flagship ? (
                <span className="border-l-2 border-accent pl-2 text-[11px] font-semibold text-accent">
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
                <span className="border-l border-accent pl-2 text-[10px] font-semibold text-accent">
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
      ) : variant === "dense" ? (
        <p className="mt-2 pl-8 text-[10px] uppercase tracking-wide text-muted-foreground">
          Non classé
        </p>
      ) : null}
      {open && article.summary_fr && (
        <p className="mt-3 max-w-2xl border-l border-border-light pl-4 text-[13px] leading-relaxed text-foreground-body sm:pl-8">
          {article.summary_fr}
        </p>
      )}
    </div>
  );
}
