"use client";

/**
 * ArticleCard — Carte article compacte.
 *
 * Pattern produit : click titre OU bouton "Lire" → reader modal.
 * Aucun expand inline — toute la lecture passe par ArticleReadModal.
 *
 * Hiérarchie typographique :
 *   1. TYPE    → text-micro uppercase
 *   2. TITRE   → text-heading font-serif, click → openArticle
 *   3. THÈSE   → italic serif (toujours visible, 2 lignes)
 *   4. MÉTA    → text-footnote muted
 *   5. BOUTON  → "Lire" → openArticle
 */

import Image from "next/image";
import { memo } from "react";
import { relevanceBandLabelFr } from "@/lib/article-relevance-display";
import { articleTypeLabelFr } from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type { Article } from "@/lib/types";
import { formatPublishedAtFr } from "@/lib/dates-display-fr";
import { ConfidenceBadge } from "./confidence-badge";
import { useArticleReader } from "@/contexts/article-reader";
import { cn } from "@/lib/utils";

interface ArticleCardProps {
  article:         Article;
  selected:        boolean;
  onToggle:        (id: string) => void;
  variant?:        "list" | "grid";
  topicLabelsFr?:  Record<string, string> | null;
}

const EDITORIAL_TYPES = new Set(["opinion", "editorial", "tribune"]);
const NEWS_LIKE_TYPES = new Set(["news", "reportage", "interview"]);

function typeLabel(type: string | null | undefined): string {
  return articleTypeLabelFr(type ?? undefined) ?? type ?? "";
}

function relevancePct(article: Article): string | null {
  return relevanceBandLabelFr(article.relevance_band, article.editorial_relevance);
}

export const ArticleCard = memo(function ArticleCard({
  article,
  selected,
  onToggle,
  variant = "list",
  topicLabelsFr = null,
}: ArticleCardProps) {
  const { openArticle, prefetchArticle } = useArticleReader();

  const isEditorial = EDITORIAL_TYPES.has(article.article_type || "");
  const isNewsLike  = NEWS_LIKE_TYPES.has(article.article_type || "");
  const cc       = (article.country_code ?? "").trim().toUpperCase();
  const flag     = cc ? REGION_FLAG_EMOJI[cc] : null;
  const typeLbl  = typeLabel(article.article_type);
  const date     = article.published_at ? formatPublishedAtFr(article.published_at, "short") : null;
  const pertinence = relevancePct(article);
  const hasImage   = Boolean(article.image_url);
  const hasSummaryOrAnalysis = Boolean(article.summary_fr || article.analysis_bullets_fr?.length);

  void topicLabelsFr; // passed by parent, used by reader modal via API

  return (
    <article
      className={cn(
        "group relative rounded-lg border bg-card transition-all",
        "[transition-timing-function:var(--ease-out-expo)] [transition-duration:var(--duration-fast)]",
        "hover:shadow-mid hover:-translate-y-px",
        selected
          ? "border-accent/40 bg-accent-tint/40 ring-1 ring-accent/30"
          : "border-border hover:border-border/80",
        variant === "list" ? "py-4" : "",
      )}
      onMouseEnter={() => prefetchArticle(article.id)}
    >
      {/* Checkbox sélection */}
      <button
        onClick={() => onToggle(article.id)}
        aria-label={selected ? "Désélectionner" : "Sélectionner"}
        className={cn(
          "absolute left-3 top-3 flex h-4 w-4 items-center justify-center border transition-colors",
          "[transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out-expo)]",
          selected
            ? "border-accent bg-accent"
            : "border-border bg-background hover:border-foreground/50",
        )}
        style={{ borderRadius: 3 }}
      >
        {selected && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </button>

      {/* Contenu principal */}
      <div className={cn("pl-9 pr-4", variant === "grid" ? "pt-1 pb-4" : "")}>

        {/* Image — grid uniquement */}
        {variant === "grid" && hasImage && (
          <div
            className="relative mb-3 w-full overflow-hidden rounded-lg bg-muted/30"
            style={{ aspectRatio: "16/9" }}
          >
            <Image
              src={article.image_url!}
              alt={article.image_caption || article.title_fr || ""}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 400px"
            />
            {article.image_caption && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 pb-1.5 pt-4">
                <p className="text-[10px] leading-snug text-white/90">{article.image_caption}</p>
              </div>
            )}
          </div>
        )}

        {/* Niveau 1 : type */}
        {typeLbl && (
          <p
            className={cn(
              "mb-1 text-[10px] font-bold uppercase tracking-[0.12em]",
              isEditorial ? "text-accent" : "text-muted-foreground",
            )}
          >
            {flag && <span className="mr-1">{flag}</span>}
            {isEditorial || isNewsLike ? typeLbl : null}
            {!isEditorial && !isNewsLike && article.media_name ? article.media_name : null}
          </p>
        )}

        {/* Niveau 2 : titre — click → reader */}
        <h3
          className={cn(
            "cursor-pointer leading-snug hover:text-accent transition-colors",
            "[transition-duration:var(--duration-fast)]",
            variant === "grid"
              ? "font-[family-name:var(--font-serif)] text-[17px] font-semibold text-foreground"
              : isEditorial
                ? "font-[family-name:var(--font-serif)] text-[16px] font-semibold text-foreground"
                : "text-[14px] font-medium text-foreground",
          )}
          onClick={() => openArticle(article.id)}
        >
          {article.title_fr || article.title_original}
        </h3>

        {/* Badge traduction faible */}
        {article.translation_confidence != null && article.translation_confidence < 0.7 && (
          <div className="mt-1">
            <ConfidenceBadge score={article.translation_confidence} />
          </div>
        )}

        {/* Niveau 3 : thèse */}
        {article.thesis_summary_fr && (
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

        {/* Niveau 4 : méta */}
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

        {/* Bouton Lire → reader modal */}
        {hasSummaryOrAnalysis && (
          <button
            onClick={() => openArticle(article.id)}
            className="olj-btn-secondary mt-2.5 px-2.5 py-1 text-[10px]"
          >
            Lire
          </button>
        )}
      </div>
    </article>
  );
});
