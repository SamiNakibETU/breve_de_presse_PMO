"use client";

/**
 * ArticleCard — Carte article style magazine éditorial.
 *
 * Hiérarchie typographique en 4 niveaux (Ryo Lu / Dieter Rams) :
 *   1. TYPE    → text-micro uppercase, accent si éditorial, muted sinon
 *   2. TITRE   → text-heading font-serif font-semibold
 *   3. THÈSE   → text-body font-serif italic (toujours visible)
 *   4. MÉTA    → text-footnote text-muted-foreground
 *
 * Expand : résumé complet + analyse (bullets) + citations + angle + thèmes
 */

import Link from "next/link";
import Image from "next/image";
import { memo, useState } from "react";
import { relevanceBandLabelFr } from "@/lib/article-relevance-display";
import { articleTypeLabelFr } from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type { Article } from "@/lib/types";
import { formatPublishedAtFr } from "@/lib/dates-display-fr";
import { formatQuoteForDisplay } from "@/lib/text-utils";
import { normalizeBulletLine } from "@/lib/analysis-text-normalize";
import { ConfidenceBadge } from "./confidence-badge";
import { SectionLabel } from "@/components/ui/editorial-primitives";
import { cn } from "@/lib/utils";

interface ArticleCardProps {
  article: Article;
  selected: boolean;
  onToggle: (id: string) => void;
  variant?: "list" | "grid";
  topicLabelsFr?: Record<string, string> | null;
}

const EDITORIAL_TYPES = new Set(["opinion", "editorial", "tribune"]);
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

function relevancePct(article: Article): string | null {
  if (article.editorial_relevance != null) {
    return `${Math.round(article.editorial_relevance * 100)} %`;
  }
  const lbl = relevanceBandLabelFr(article.relevance_band, null);
  return lbl ?? null;
}

export const ArticleCard = memo(function ArticleCard({
  article,
  selected,
  onToggle,
  variant = "list",
  topicLabelsFr = null,
}: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isEditorial = EDITORIAL_TYPES.has(article.article_type || "");
  const isNewsLike = NEWS_LIKE_TYPES.has(article.article_type || "");
  const cc = (article.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const typeLbl = typeLabel(article.article_type);
  const date = article.published_at
    ? formatPublishedAtFr(article.published_at, "short")
    : null;
  const pertinence = relevancePct(article);
  const hasImage = Boolean(article.image_url);
  const hasBullets =
    article.analysis_bullets_fr && article.analysis_bullets_fr.length > 0;

  return (
    <article
      className={cn(
        "group relative rounded-xl border bg-card transition-all",
        "[transition-timing-function:var(--ease-out-expo)] [transition-duration:var(--duration-fast)]",
        "hover:shadow-mid hover:-translate-y-px",
        selected
          ? "border-accent/40 bg-accent-tint/40 ring-1 ring-accent/30"
          : "border-border hover:border-border/80",
        variant === "list" ? "py-4" : "",
      )}
    >
      {/* Checkbox sélection — carré minimaliste */}
      <button
        onClick={() => onToggle(article.id)}
        aria-label={selected ? "Désélectionner" : "Sélectionner"}
        className={cn(
          "absolute left-3 top-3 flex h-4 w-4 items-center justify-center border transition-colors",
          "[transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out-expo)]",
          selected
            ? "border-accent bg-accent scale-100"
            : "border-border bg-background hover:border-foreground/50",
        )}
        style={{ borderRadius: 3 }}
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

      {/* Contenu principal */}
      <div className={cn("pl-9 pr-4", variant === "grid" ? "pt-1 pb-4" : "")}>
        {/* IMAGE — 16:9 en haut pour variant grid */}
        {variant === "grid" && hasImage && (
          <div className="relative mb-3 w-full overflow-hidden rounded-lg bg-muted/30" style={{ aspectRatio: "16/9" }}>
            <Image
              src={article.image_url!}
              alt={article.image_caption || article.title_fr || ""}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 400px"
            />
            {article.image_caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-4">
                <p className="text-[10px] leading-snug text-white/90">
                  {article.image_caption}
                </p>
              </div>
            )}
          </div>
        )}

        {/* NIVEAU 1 : TYPE ARTICLE */}
        {typeLbl && (
          <p
            className={cn(
              "mb-1 text-[10px] font-bold uppercase tracking-[0.12em]",
              isEditorial ? "text-accent" : "text-muted-foreground",
            )}
          >
            {flag && <span className="mr-1">{flag}</span>}
            {isEditorial || isNewsLike ? typeLbl : null}
            {!isEditorial && !isNewsLike && article.media_name
              ? article.media_name
              : null}
          </p>
        )}

        {/* NIVEAU 2 : TITRE */}
        <h3
          className={cn(
            "cursor-pointer leading-snug hover:text-accent",
            "[transition-duration:var(--duration-fast)] transition-colors",
            variant === "grid"
              ? "font-[family-name:var(--font-serif)] text-[17px] font-semibold text-foreground"
              : isEditorial
                ? "font-[family-name:var(--font-serif)] text-[16px] font-semibold text-foreground"
                : isNewsLike
                  ? "text-[14px] font-medium text-foreground"
                  : "text-[14px] font-medium text-foreground",
          )}
          onClick={() => setExpanded(!expanded)}
        >
          {article.title_fr || article.title_original}
        </h3>

        {/* Confidence badge si traduction faible */}
        {article.translation_confidence != null &&
          article.translation_confidence < 0.7 && (
            <div className="mt-1">
              <ConfidenceBadge score={article.translation_confidence} />
            </div>
          )}

        {/* NIVEAU 3 : THÈSE — toujours visible (valeur ajoutée AI) */}
        {article.thesis_summary_fr && !expanded && (
          <p
            className={cn(
              "mt-2 font-[family-name:var(--font-serif)] italic leading-relaxed text-foreground-body",
              variant === "grid" ? "text-[13px] line-clamp-3" : "text-[13px] line-clamp-2",
            )}
          >
            {article.thesis_summary_fr}
          </p>
        )}

        {/* Erreur traitement */}
        {(article.status === "error" || article.status === "translation_abandoned") &&
          article.processing_error && (
            <p className="mt-1 line-clamp-2 font-mono text-[10px] text-destructive">
              {article.processing_error}
            </p>
          )}

        {/* NIVEAU 4 : MÉTA BAS */}
        {!expanded && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {[
              isEditorial || isNewsLike ? article.media_name : null,
              !isEditorial && !isNewsLike && article.country ? article.country : null,
              article.author || null,
              date,
              pertinence ? `Pertinence ${pertinence}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        {/* CONTENU EXPANSÉ */}
        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Image en variant liste dans l'expand */}
            {variant === "list" && hasImage && (
              <div
                className="relative w-full overflow-hidden rounded-lg bg-muted/30"
                style={{ aspectRatio: "16/9" }}
              >
                <Image
                  src={article.image_url!}
                  alt={article.image_caption || article.title_fr || ""}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 640px"
                />
              </div>
            )}

            {/* Thèse complète */}
            {article.thesis_summary_fr && (
              <div>
                <SectionLabel className="mb-1.5">Thèse</SectionLabel>
                <p className="font-[family-name:var(--font-serif)] text-[14px] italic leading-relaxed text-foreground-body">
                  {article.thesis_summary_fr}
                </p>
              </div>
            )}

            {/* Résumé */}
            {article.summary_fr && (
              <div>
                <SectionLabel className="mb-1.5">Résumé</SectionLabel>
                <p className="text-[13px] leading-[1.75] text-foreground-body">
                  {article.summary_fr}
                </p>
              </div>
            )}

            {/* Analyse — bullets avec bordure accent */}
            {hasBullets && (
              <div>
                <SectionLabel className="mb-1.5">Analyse</SectionLabel>
                <div className="border-l-2 border-accent bg-muted/20 py-2.5 pl-3.5 pr-3 rounded-r-md">
                  <ol className="space-y-1.5">
                    {article.analysis_bullets_fr!.map((b, i) => {
                      const line = normalizeBulletLine(b);
                      if (!line) return null;
                      return (
                        <li key={i} className="flex gap-2 text-[13px] leading-snug text-foreground-body">
                          <span className="mt-px shrink-0 text-[11px] font-bold tabular-nums text-accent">
                            {i + 1}.
                          </span>
                          <span>{line}</span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}

            {/* Citations clés */}
            {article.key_quotes_fr && article.key_quotes_fr.length > 0 && (
              <div>
                <SectionLabel className="mb-1.5">Citations clés</SectionLabel>
                <ul className="space-y-2 border border-border-light rounded-md bg-muted/10 px-3 py-2.5">
                  {article.key_quotes_fr.map((q, i) => (
                    <li
                      key={i}
                      className="font-[family-name:var(--font-serif)] text-[13px] italic leading-relaxed text-foreground-subtle"
                    >
                      «&nbsp;{formatQuoteForDisplay(q)}&nbsp;»
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Angle + Thèmes */}
            <div className="space-y-1 border-t border-border-light pt-3 text-[12px] text-muted-foreground">
              {article.editorial_angle?.trim() ? (
                <p>
                  <span className="font-medium text-foreground-body">Angle : </span>
                  {article.editorial_angle.trim()}
                </p>
              ) : null}
              {oljThemesLine(article.olj_topic_ids, topicLabelsFr) ? (
                <p>
                  <span className="font-medium text-foreground-body">Thèmes OLJ : </span>
                  {oljThemesLine(article.olj_topic_ids, topicLabelsFr)}
                </p>
              ) : null}
              {pertinence && (
                <p>
                  <span className="font-medium text-foreground-body">Pertinence : </span>
                  {pertinence}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href={`/articles/${article.id}`}
                className="text-[12px] font-semibold text-accent underline underline-offset-2 hover:opacity-90"
              >
                Lire la fiche complète
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
              <button
                onClick={() => setExpanded(false)}
                className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
              >
                Réduire
              </button>
            </div>
          </div>
        )}

        {/* Bouton expand si résumé disponible et non expansé */}
        {!expanded && article.summary_fr && (
          <button
            onClick={() => setExpanded(true)}
            className="mt-2 text-[11px] text-accent hover:underline underline-offset-2"
          >
            Lire le résumé →
          </button>
        )}
      </div>
    </article>
  );
});
