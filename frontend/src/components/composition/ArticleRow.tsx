"use client";

import { useState } from "react";
import { useArticleReader } from "@/contexts/article-reader";
import {
  FLAGSHIP_BADGE_LABEL,
  articleTypeLabelFr,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
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
  attachmentLabel?: string | null;
  variant?: "default" | "dense" | "topicDetail";
  topicRef?: TopicArticleRef | null;
}) {
  const { openArticle, prefetchArticle } = useArticleReader();
  const [open, setOpen] = useState(false);
  const title = article.title_fr || article.title_original;
  const cc = (article.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const typeFr = articleTypeLabelFr(article.article_type);
  const isTopicDetail = variant === "topicDetail";
  const isDense = variant === "dense";

  const hasBullets = article.analysis_bullets_fr && article.analysis_bullets_fr.length > 0;

  /* ── Méta header — journal, pays, type ─── */
  const metaHeader = (isDense || isTopicDetail) ? (
    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      {flag ? (
        <span className="text-[13px] leading-none" aria-hidden>{flag}</span>
      ) : cc ? (
        <span className="text-[11px] font-medium text-muted-foreground">{cc}</span>
      ) : null}
      <span className="text-[13px] font-semibold text-foreground">
        {article.media_name}
      </span>
      {article.country?.trim() && !flag ? (
        <span className="text-[11px] text-muted-foreground">{article.country.trim()}</span>
      ) : null}
      {typeFr ? (
        <span className="text-[10px] font-bold uppercase tracking-wide text-accent/80">
          {typeFr}
        </span>
      ) : null}
      {article.author?.trim() ? (
        <span className="text-[11px] text-muted-foreground">· {article.author.trim()}</span>
      ) : null}
      {/* Regard mis en avant — garder car utile éditorialement */}
      {topicRef?.is_recommended ? (
        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
          Regard mis en avant
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className={
        isTopicDetail
          ? "border-b border-border-light py-3.5 text-[13px]"
          : isDense
            ? "text-[13px]"
            : "border-b border-border-light py-3 text-[13px]"
      }
    >
      <div className="flex items-start gap-3">
        {/* Checkbox custom carré */}
        <button
          type="button"
          onClick={() => onSelectedChange(!selected)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center border transition-colors"
          style={{
            borderRadius: 3,
            borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
            background: selected ? "var(--color-accent)" : "var(--color-background)",
          }}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          )}
        </button>

        {/* Contenu principal */}
        <button
          type="button"
          className="min-w-0 flex-1 rounded-sm text-left focus:outline-none"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {metaHeader}

          {/* Titre */}
          <span
            className={
              isDense || isTopicDetail
                ? "block font-[family-name:var(--font-serif)] text-[14px] font-medium leading-snug text-foreground"
                : "font-medium leading-snug text-foreground"
            }
          >
            {title}
          </span>

          {/* Thèse — complète, sans line-clamp */}
          {article.thesis_summary_fr && (
            <p
              className={
                isDense || isTopicDetail
                  ? "mt-1.5 font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body"
                  : "mt-1.5 italic leading-relaxed text-foreground-body"
              }
            >
              {article.thesis_summary_fr}
            </p>
          )}

          {/* Bullets d'analyse — toujours visibles (2 premières) */}
          {isTopicDetail && hasBullets && (
            <ul className="mt-2 space-y-1.5">
              {article.analysis_bullets_fr!.slice(0, 2).map((b, i) => (
                <li key={i} className="flex gap-1.5 text-[12px] leading-snug text-foreground-body">
                  <span className="mt-px shrink-0 font-bold text-accent">{i + 1}.</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Méta default */}
          {variant === "default" && (
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
          )}

          {/* Méta dense/topicDetail */}
          {(isDense || isTopicDetail) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {article.editorial_angle ? (
                <span className="text-[10px] leading-snug text-foreground-subtle">
                  {article.editorial_angle}
                </span>
              ) : null}
              {article.is_flagship ? (
                <span className="inline-flex rounded-full border border-accent/35 bg-accent/5 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  {FLAGSHIP_BADGE_LABEL}
                </span>
              ) : null}
            </div>
          )}
        </button>

        {/* Actions droite */}
        <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            className="olj-btn-secondary px-2.5 py-1 text-[10px]"
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
              className="olj-link-action text-[10px]"
              onClick={(e) => e.stopPropagation()}
            >
              Source ↗
            </a>
          ) : null}
        </div>
      </div>

      {/* Attachement label */}
      {attachmentLabel ? (
        <p className="mt-2 pl-7 text-[10px] font-medium uppercase tracking-wide text-info">
          {attachmentLabel}
        </p>
      ) : null}

      {/* Expand : résumé + bullets restants */}
      {open && (
        <div className="mt-3 max-w-2xl space-y-3 rounded-md border border-border/40 bg-muted/10 px-3.5 py-3 text-[13px] leading-relaxed text-foreground-body">
          {article.summary_fr && <p>{article.summary_fr}</p>}
          {isTopicDetail && hasBullets && article.analysis_bullets_fr!.length > 2 ? (
            <ul className="space-y-1.5 border-t border-border/40 pt-2.5 text-[12px]">
              {article.analysis_bullets_fr!.slice(2).map((b, i) => (
                <li key={i} className="flex gap-1.5 leading-snug text-foreground-body">
                  <span className="mt-px shrink-0 font-bold text-accent">{i + 3}.</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
