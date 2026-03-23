"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FLAGSHIP_BADGE_LABEL,
  articleTypeLabelFr,
  articleTypePictogramFr,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { countryCodesFromPreviews } from "@/lib/topic-country-codes";
import type { EditionTopic, TopicArticlePreview } from "@/lib/types";

/** Nombre d’articles visibles par défaut avant « + N autres regards ». */
export const VISIBLE_PER_TOPIC = 3;

const SUMMARY_PREVIEW_COUNT = 2;
const MAX_ARTICLES_PER_COUNTRY = 2;

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

function groupVisibleByCountry(
  items: TopicArticlePreview[],
): [string, TopicArticlePreview[]][] {
  const m = new Map<string, TopicArticlePreview[]>();
  for (const p of items) {
    const code = (p.country_code ?? "").trim().toUpperCase() || "—";
    const list = m.get(code) ?? [];
    list.push(p);
    m.set(code, list);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "fr"));
}

function countryHeaderLabel(
  code: string,
  previewsInGroup: TopicArticlePreview[],
  labelsFr: Record<string, string> | null | undefined,
): string {
  if (code === "—") return "Pays non renseigné";
  const fromApi = labelsFr?.[code];
  if (fromApi) return fromApi.toUpperCase();
  const name = previewsInGroup[0]?.country?.trim();
  if (name) return name.toUpperCase();
  return code;
}

function TopicArticleLine({
  preview,
  selected,
  onToggle,
  compact,
}: {
  preview: TopicArticlePreview;
  selected: boolean;
  onToggle: (next: boolean) => void;
  compact?: boolean;
}) {
  const title = preview.title_fr || preview.title_original;
  const typeFr = articleTypeLabelFr(preview.article_type);
  const picto = articleTypePictogramFr(preview.article_type);
  return (
    <div className="border-b border-border-light py-2.5 text-[13px] last:border-b-0">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1.5 size-[15px] shrink-0 border-border"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Inclure ${title}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-foreground">
            <span className="text-muted-foreground">{picto}</span>{" "}
            {preview.media_name}
            {typeFr ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {typeFr}
              </span>
            ) : null}
          </p>
          <span className="mt-1 block font-[family-name:var(--font-serif)] font-medium leading-snug text-foreground">
            {title}
          </span>
          {!compact && preview.thesis_summary_fr ? (
            <p className="mt-1 line-clamp-2 font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body">
              {preview.thesis_summary_fr}
            </p>
          ) : null}
          {!compact ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="min-w-0">
                {formatArticleMetaLine({
                  mediaName: preview.media_name,
                  country: preview.country,
                  articleType: preview.article_type,
                  sourceLanguage: preview.source_language,
                })}
              </span>
              {preview.editorial_angle ? (
                <span className="block w-full text-[10px] leading-snug text-foreground-subtle">
                  {preview.editorial_angle}
                </span>
              ) : null}
              {preview.is_flagship ? (
                <span className="border-l border-accent pl-2 text-[10px] font-semibold text-accent">
                  {FLAGSHIP_BADGE_LABEL}
                </span>
              ) : null}
            </div>
          ) : null}
          {preview.url ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="olj-focus mt-1.5 inline-block text-[10px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
            >
              Source ↗
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function countriesInlineFromCodes(codes: string[]): string {
  if (!codes.length) return "";
  return codes
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
  countryLabelsFr,
}: {
  topic: EditionTopic;
  selectedIds: ReadonlySet<string>;
  onToggleArticle: (articleId: string, next: boolean) => void;
  editionDate?: string;
  mode?: "full" | "summary";
  /** Libellés pays (coverage-targets) pour en-têtes de colonne droite. */
  countryLabelsFr?: Record<string, string> | null;
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

  const derivedCodes = useMemo(
    () => countryCodesFromPreviews(previews),
    [previews],
  );
  const countriesText = countriesInlineFromCodes(derivedCodes);
  const articleTotal = topic.article_count ?? previews.length;
  const nCountryCodes = derivedCodes.length;
  const multiPays = nCountryCodes >= 2;
  const contrasting = pickContrastingPreviews(previews, 3);
  const showContrastingBlock =
    mode === "summary" && previews.length > 0 && contrasting.length >= 2;

  const groups = useMemo(() => groupVisibleByCountry(visible), [visible]);

  const titleNode =
    mode === "summary" && editionDate ? (
      <h2 className="font-[family-name:var(--font-serif)] text-[17px] font-semibold leading-snug tracking-tight text-foreground sm:text-[19px]">
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
    );

  const sectionClass =
    mode === "summary"
      ? "border-b border-border pb-8 pt-3"
      : "border-b border-border pb-10 pt-4";

  return (
    <section
      className={`${sectionClass} ${multiPays ? "border-l-4 border-accent pl-4 sm:pl-5" : "border-l-4 border-border pl-4 sm:pl-5"}`}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-8">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="tabular-nums text-[11px] font-medium text-muted-foreground">
              {topic.rank}
            </span>
            {titleNode}
          </div>
          {(topic.angle_summary?.trim() || topic.description?.trim()) && (
            <div className="max-w-xl space-y-2 text-[13px] leading-relaxed text-foreground-body">
              {topic.angle_summary?.trim() && (
                <p className="line-clamp-3 font-[family-name:var(--font-serif)] text-[14px] text-foreground">
                  {topic.angle_summary.trim()}
                </p>
              )}
              {topic.description?.trim() &&
                topic.description.trim() !== topic.angle_summary?.trim() && (
                  <p className="line-clamp-3">{topic.description.trim()}</p>
                )}
            </div>
          )}
          {topic.dominant_angle?.trim() ? (
            <p className="max-w-xl font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body line-clamp-3">
              {topic.dominant_angle.trim()}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {topic.is_multi_perspective ? (
              <span className="border-l border-info pl-2 text-[11px] font-medium text-foreground">
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
              <span className="rounded bg-highlight/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
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
            <ul className="space-y-2 border-l border-border pl-3">
              {contrasting.map((p) => {
                const cc = (p.country_code ?? "").trim().toUpperCase() || "";
                const flag = REGION_FLAG_EMOJI[cc];
                const place = p.country?.trim() || cc || "Région";
                return (
                  <li key={p.id} className="text-[11px] leading-snug">
                    <span className="font-medium text-foreground">
                      {flag ? `${flag} ${place}` : place}
                    </span>
                    {p.thesis_summary_fr ? (
                      <p className="mt-0.5 italic text-foreground-body line-clamp-2">
                        {p.thesis_summary_fr}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {mode === "summary" && editionDate && (
            <p className="pt-1">
              <Link
                href={`/edition/${editionDate}/topic/${topic.id}`}
                className="olj-link-action text-[12px]"
              >
                Fiche sujet
              </Link>
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-sm border border-border-light bg-card/60 p-3 sm:p-4">
          {groups.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              Aucun aperçu d’article pour ce sujet.
            </p>
          ) : (
            groups.map(([code, list]) => {
              const header = countryHeaderLabel(code, list, countryLabelsFr);
              const flag = code !== "—" ? REGION_FLAG_EMOJI[code] : null;
              const shown = list.slice(0, MAX_ARTICLES_PER_COUNTRY);
              const more = list.length - shown.length;
              return (
                <div key={code || "x"} className="mb-4 last:mb-0">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {flag ? `${flag} ${header}` : header}
                  </p>
                  <div className="rounded border border-border-light bg-background/80">
                    {shown.map((p) => (
                      <TopicArticleLine
                        key={p.id}
                        preview={p}
                        selected={selectedIds.has(p.id)}
                        onToggle={(next) => onToggleArticle(p.id, next)}
                        compact={mode === "summary"}
                      />
                    ))}
                  </div>
                  {more > 0 ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      + {more} autre{more > 1 ? "s" : ""} texte
                      {more > 1 ? "s" : ""} ({header})
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

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
          className="olj-link-action mt-4 text-[12px]"
          onClick={() => setExpanded(true)}
        >
          Afficher les {restCount} autre{restCount > 1 ? "s" : ""} texte
          {restCount > 1 ? "s" : ""}
        </button>
      )}
    </section>
  );
}
