"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { relevanceBandLabelFr } from "@/lib/article-relevance-display";
import { articleTypeLabelFr } from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type { Article } from "@/lib/types";
import { formatPublishedAtFr } from "@/lib/dates-display-fr";
import { formatQuoteForDisplay } from "@/lib/text-utils";
import { ConfidenceBadge } from "./confidence-badge";

interface ArticleCardProps {
  article: Article;
  selected: boolean;
  onToggle: (id: string) => void;
  /** Carte dans une grille 2 colonnes (méta pays + journal en tête). */
  variant?: "list" | "grid";
  /** Libellés thèmes OLJ (taxonomie). */
  topicLabelsFr?: Record<string, string> | null;
}

const EDITORIAL_TYPES = new Set(["opinion", "editorial", "tribune"]);
/** News / reportage / interview : hiérarchie visuelle plus discrète. */
const NEWS_LIKE_TYPES = new Set(["news", "reportage", "interview"]);

function typeLabel(type: string | null | undefined): string {
  return articleTypeLabelFr(type ?? undefined) ?? type ?? "";
}

function oljThemesLine(
  ids: string[] | null | undefined,
  labelsFr: Record<string, string> | null | undefined,
): string | null {
  if (!ids?.length) return null;
  const parts = ids
    .map((id) => labelsFr?.[id.trim()]?.trim() || id.trim())
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function ArticleCard({
  article,
  selected,
  onToggle,
  variant = "list",
  topicLabelsFr = null,
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isEditorial = EDITORIAL_TYPES.has(article.article_type || "");
  const isNewsLike = NEWS_LIKE_TYPES.has(article.article_type || "");
  const relevanceLabel = relevanceBandLabelFr(
    article.relevance_band,
    article.editorial_relevance,
  );
  const cc = (article.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const typeLbl = typeLabel(article.article_type);

  const date = article.published_at
    ? formatPublishedAtFr(article.published_at, "short")
    : null;

  const summaryPreview = article.summary_fr
    ? article.summary_fr.length > 200
      ? article.summary_fr.slice(0, 200) + "…"
      : article.summary_fr
    : null;

  return (
    <article
      className={
        variant === "grid"
          ? selected
            ? "rounded-sm ring-1 ring-accent/35 bg-accent-tint/60"
            : ""
          : `border-b border-border-light py-4 ${selected ? "bg-accent-tint/50" : ""}`
      }
    >
      <div className="flex gap-3">
        <button
          onClick={() => onToggle(article.id)}
          aria-label={selected ? "Désélectionner" : "Sélectionner"}
          className={`mt-1.5 flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center border border-border transition-colors ${
            selected ? "border-accent bg-accent" : "hover:border-foreground"
          }`}
        >
          {selected && (
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          {variant === "grid" ? (
            <>
              {article.image_url && (
                <div className="relative mb-2 h-28 w-full overflow-hidden rounded-sm bg-muted/30">
                  <Image
                    src={article.image_url}
                    alt={article.image_caption || article.title_fr || ""}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 320px"
                    unoptimized
                  />
                </div>
              )}
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
                {typeLbl ? (
                  <span className="rounded-sm bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-body">
                    {typeLbl}
                  </span>
                ) : null}
                {article.is_flagship ? (
                  <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    Référence
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {variant === "list" &&
                  (isEditorial || isNewsLike) &&
                  article.article_type && (
                  <span
                    className={`inline-block text-[10px] font-bold uppercase tracking-[0.12em] ${
                      isEditorial ? "text-accent" : "text-muted-foreground"
                    }`}
                  >
                    {typeLabel(article.article_type)}
                  </span>
                )}
                {relevanceLabel && (
                  <span className="rounded-sm bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-foreground-body">
                    {relevanceLabel}
                  </span>
                )}
              </div>
              <h3
                className={`flex cursor-pointer items-start gap-2 leading-snug hover:text-accent ${
                  variant === "grid"
                    ? "font-[family-name:var(--font-serif)] text-[16px] font-semibold leading-[1.35] text-foreground sm:text-[17px]"
                    : isEditorial
                      ? "font-[family-name:var(--font-serif)] text-[17px] font-normal"
                      : isNewsLike
                        ? "text-[13px] font-normal text-muted-foreground"
                        : "text-[14px] font-medium"
                }`}
                onClick={() => setExpanded(!expanded)}
              >
                <span
                  className="mt-0.5 shrink-0 text-muted-foreground transition-transform"
                  style={{ transform: expanded ? "rotate(90deg)" : "none" }}
                  aria-hidden
                >
                  ›
                </span>
                <span className="min-w-0">
                  {article.title_fr || article.title_original}
                </span>
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
              <p className="mt-1 line-clamp-2 font-mono text-[10px] text-destructive">
                {article.processing_error}
              </p>
            )}

          {variant === "list" ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {article.media_name}
              <span className="mx-1">·</span>
              {article.country}
              {article.author && (
                <>
                  <span className="mx-1">·</span>
                  {article.author}
                </>
              )}
              {date && (
                <>
                  <span className="mx-1">·</span>
                  {date}
                </>
              )}
              {!isEditorial && article.article_type && (
                <span className="ml-2 border border-border-light px-1 py-px text-[10px] uppercase tracking-wider text-muted-foreground">
                  {typeLabel(article.article_type)}
                </span>
              )}
              {article.is_flagship ? (
                <span className="ml-2 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                  Référence
                </span>
              ) : null}
              {article.is_syndicated && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  Reprise
                </span>
              )}
              {article.syndicate_siblings_count != null &&
                article.syndicate_siblings_count > 0 && (
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    +{article.syndicate_siblings_count} reprise
                    {article.syndicate_siblings_count > 1 ? "s" : ""}
                  </span>
                )}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {article.author ? `${article.author} · ` : null}
              {date ?? ""}
              {article.is_syndicated ? (
                <span className="ml-2 text-[10px]">Reprise</span>
              ) : null}
            </p>
          )}

          {article.thesis_summary_fr && !expanded && (
            <p className="mt-2 line-clamp-2 font-[family-name:var(--font-serif)] text-[14px] italic leading-snug text-foreground">
              {article.thesis_summary_fr}
            </p>
          )}

          {summaryPreview && !expanded && (
            <p
              className="mt-2 cursor-pointer text-[13px] leading-relaxed text-foreground-body"
              onClick={() => setExpanded(true)}
            >
              {summaryPreview}
            </p>
          )}

          {expanded && (
            <div className="mt-3 space-y-2">
              {variant === "list" && article.image_url && (
                <div className="relative h-36 w-full overflow-hidden rounded-sm bg-muted/30 sm:h-44">
                  <Image
                    src={article.image_url}
                    alt={article.image_caption || article.title_fr || ""}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 640px"
                    unoptimized
                  />
                </div>
              )}
              {article.thesis_summary_fr && (
                <p className="font-[family-name:var(--font-serif)] text-[14px] italic text-foreground">
                  {article.thesis_summary_fr}
                </p>
              )}
              {article.summary_fr && (
                <p className="max-w-2xl text-[13px] leading-[1.7] text-foreground-body">
                  {article.summary_fr}
                </p>
              )}
              {article.key_quotes_fr && article.key_quotes_fr.length > 0 && (
                <div className="space-y-1 rounded-md bg-muted/15 p-3">
                  {article.key_quotes_fr.map((q, i) => (
                    <p
                      key={i}
                      className="font-[family-name:var(--font-serif)] text-[13px] italic text-foreground-subtle"
                    >
                      «&nbsp;{formatQuoteForDisplay(q)}&nbsp;»
                    </p>
                  ))}
                </div>
              )}
              {article.editorial_angle?.trim() ? (
                <p className="text-[12px] leading-relaxed text-foreground-subtle">
                  <span className="font-medium text-muted-foreground">
                    Angle :{" "}
                  </span>
                  {article.editorial_angle.trim()}
                </p>
              ) : null}
              {oljThemesLine(article.olj_topic_ids, topicLabelsFr) ? (
                <p className="text-[12px] leading-relaxed text-foreground-body">
                  <span className="font-medium text-muted-foreground">
                    Thèmes OLJ :{" "}
                  </span>
                  {oljThemesLine(article.olj_topic_ids, topicLabelsFr)}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3 pt-1">
                <Link
                  href={`/articles/${article.id}`}
                  className="text-[12px] font-medium text-accent underline underline-offset-2 hover:opacity-90"
                >
                  Lire l’article complet
                </Link>
                {article.url ? (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                  >
                    Source originale ↗
                  </a>
                ) : null}
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="block text-[11px] text-muted-foreground hover:text-foreground"
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
