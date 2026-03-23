"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FLAGSHIP_BADGE_LABEL,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type { EditionTopic, TopicArticlePreview } from "@/lib/types";

/** Nombre d’articles visibles par défaut avant « + N autres regards ». */
export const VISIBLE_PER_TOPIC = 3;

const SUMMARY_PREVIEW_COUNT = 2;

/** Jusqu’à `max` aperçus, un par pays, pour montrer le contraste des regards. */
function pickContrastingPreviews(
  previews: TopicArticlePreview[],
  max: number,
): TopicArticlePreview[] {
  const seen = new Set<string>();
  const out: TopicArticlePreview[] = [];
  for (const p of previews) {
    const cc = (p.country_code ?? "").trim().toUpperCase() || "XX";
    if (seen.has(cc)) continue;
    seen.add(cc);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

function TopicArticleLine({
  preview,
  selected,
  onToggle,
}: {
  preview: TopicArticlePreview;
  selected: boolean;
  onToggle: (next: boolean) => void;
}) {
  const title = preview.title_fr || preview.title_original;
  return (
    <div className="border-b border-border-light py-3 text-[13px]">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1.5 size-[15px] shrink-0 border-border"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Inclure ${title}`}
        />
        <div className="min-w-0 flex-1">
          <span className="font-medium leading-snug text-foreground">
            {title}
          </span>
          {preview.thesis_summary_fr && (
            <p className="mt-1.5 italic leading-relaxed text-foreground-body">
              {preview.thesis_summary_fr}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span className="min-w-0">
              {formatArticleMetaLine({
                mediaName: preview.media_name,
                country: preview.country,
                articleType: preview.article_type,
                sourceLanguage: preview.source_language,
              })}
            </span>
            {preview.editorial_angle && (
              <span className="block w-full text-[11px] leading-snug text-foreground-subtle">
                {preview.editorial_angle}
              </span>
            )}
            {preview.is_flagship ? (
              <span className="border-l border-accent pl-2 text-[11px] font-semibold text-accent">
                {FLAGSHIP_BADGE_LABEL}
              </span>
            ) : null}
          </div>
          {preview.url && (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="olj-focus mt-2 inline-block text-[11px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
            >
              Source ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function countriesInlineLabel(countries: string[] | null | undefined): string {
  if (!countries?.length) return "";
  return countries
    .map((c) => {
      const u = c.trim().toUpperCase();
      const flag = REGION_FLAG_EMOJI[u];
      return flag ? `${flag} ${u}` : u;
    })
    .join(", ");
}

export function TopicSection({
  topic,
  selectedIds,
  onToggleArticle,
  editionDate,
  mode = "full",
}: {
  topic: EditionTopic;
  selectedIds: ReadonlySet<string>;
  onToggleArticle: (articleId: string, next: boolean) => void;
  /** Requis en mode `summary` pour le lien vers la fiche sujet. */
  editionDate?: string;
  /** `summary` : carte éditoriale compacte (grille sommaire). */
  mode?: "full" | "summary";
}) {
  const [expanded, setExpanded] = useState(false);
  const previews = topic.article_previews ?? [];
  const maxPreview =
    mode === "summary"
      ? expanded
        ? previews.length
        : SUMMARY_PREVIEW_COUNT
      : expanded
        ? previews.length
        : VISIBLE_PER_TOPIC;
  const visible = previews.slice(0, maxPreview);
  const restCount =
    mode === "summary"
      ? Math.max(0, previews.length - SUMMARY_PREVIEW_COUNT)
      : Math.max(0, previews.length - VISIBLE_PER_TOPIC);

  const countriesText = countriesInlineLabel(topic.countries);
  const articleTotal = topic.article_count ?? previews.length;
  const nCountryCodes = topic.countries?.length ?? 0;
  const contrasting = pickContrastingPreviews(previews, 3);
  const showContrastingBlock =
    mode === "summary" && previews.length > 0 && contrasting.length >= 2;

  const header = (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="tabular-nums text-[11px] font-medium text-muted-foreground">
          {topic.rank}
        </span>
        {mode === "summary" && editionDate ? (
          <h2 className="font-[family-name:var(--font-serif)] text-[17px] font-semibold leading-snug tracking-tight text-foreground sm:text-[18px]">
            <Link
              href={`/edition/${editionDate}/topic/${topic.id}`}
              className="hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {topic.title_final ?? topic.title_proposed}
            </Link>
          </h2>
        ) : (
          <h2 className="max-w-3xl font-[family-name:var(--font-serif)] text-[20px] font-semibold leading-snug tracking-tight text-foreground sm:text-[21px]">
            {topic.title_final ?? topic.title_proposed}
          </h2>
        )}
      </div>
      {topic.description && (
        <p
          className={
            mode === "summary"
              ? "mt-2 line-clamp-3 text-[13px] leading-relaxed text-foreground-body"
              : "mt-3 max-w-2xl text-[14px] leading-relaxed text-foreground-body"
          }
        >
          {topic.description}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {topic.is_multi_perspective ? (
          <span className="border-l border-accent pl-2 text-[11px] font-medium text-foreground">
            Plusieurs regards
            {nCountryCodes > 1
              ? ` · ${nCountryCodes} pays`
              : nCountryCodes === 1
                ? " · 1 pays"
                : null}
          </span>
        ) : (
          <span className="border-l border-border pl-2 text-foreground-body">
            Point de vue national
          </span>
        )}
        {nCountryCodes === 1 && articleTotal <= 1 ? (
          <span className="rounded bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Perspective unique
          </span>
        ) : null}
        {countriesText ? (
          <span className="text-foreground-body">{countriesText}</span>
        ) : null}
        {topic.article_count != null && (
          <span className="tabular-nums">
            {topic.article_count} texte{topic.article_count > 1 ? "s" : ""}
          </span>
        )}
      </div>
      {showContrastingBlock ? (
        <ul className="mt-4 space-y-3 border-l border-border pl-3">
          {contrasting.map((p) => {
            const cc = (p.country_code ?? "").trim().toUpperCase() || "";
            const flag = REGION_FLAG_EMOJI[cc];
            const place = p.country?.trim() || cc || "Région";
            return (
              <li key={p.id} className="text-[12px] leading-snug">
                <span className="font-medium text-foreground">
                  {flag ? `${flag} ${place}` : place}
                </span>
                {p.thesis_summary_fr ? (
                  <p className="mt-1 italic leading-relaxed text-foreground-body">
                    {p.thesis_summary_fr}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );

  const sectionClass =
    mode === "summary"
      ? "border-b border-border pb-6 pt-2"
      : "border-b border-border pb-8 pt-4";

  return (
    <section className={sectionClass}>
      {header}
      <div className={mode === "summary" ? "mt-3" : "mt-3"}>
        {visible.map((p) => (
          <TopicArticleLine
            key={p.id}
            preview={p}
            selected={selectedIds.has(p.id)}
            onToggle={(next) => onToggleArticle(p.id, next)}
          />
        ))}
      </div>
      {mode === "summary" && editionDate && (
        <p className="mt-2">
          <Link
            href={`/edition/${editionDate}/topic/${topic.id}`}
            className="olj-link-action text-[12px]"
          >
            Fiche sujet
          </Link>
        </p>
      )}
      {!expanded && restCount > 0 && mode === "full" && (
        <button
          type="button"
          className="olj-link-action mt-4"
          onClick={() => setExpanded(true)}
        >
          Voir {restCount} autre{restCount > 1 ? "s" : ""} article
          {restCount > 1 ? "s" : ""} sur ce sujet
        </button>
      )}
      {!expanded && restCount > 0 && mode === "summary" && (
        <button
          type="button"
          className="olj-link-action mt-3 text-[12px]"
          onClick={() => setExpanded(true)}
        >
          Afficher les {restCount} autre{restCount > 1 ? "s" : ""} texte
          {restCount > 1 ? "s" : ""}
        </button>
      )}
    </section>
  );
}
