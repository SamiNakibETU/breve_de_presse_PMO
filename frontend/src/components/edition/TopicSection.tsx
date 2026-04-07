"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useArticleReader } from "@/contexts/article-reader";
import {
  FLAGSHIP_BADGE_LABEL,
  articleTypeLabelFr,
  formatArticleMetaLine,
} from "@/lib/article-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { countryCodesFromPreviews } from "@/lib/topic-country-codes";
import type {
  ArticleAnalysisDisplayState,
  EditionTopic,
  TopicArticlePreview,
} from "@/lib/types";
import { decodeHtmlEntities } from "@/lib/text-utils";
import { cn } from "@/lib/utils";

/** Nombre d’articles visibles par défaut avant « + N autres regards ». */
export const VISIBLE_PER_TOPIC = 3;

function analysisQueueBadge(preview: TopicArticlePreview): string | null {
  if (preview.analysis_display_state === "complete") {
    return null;
  }
  const hint = preview.analysis_display_hint_fr?.trim();
  if (hint) {
    return hint;
  }
  const state = preview.analysis_display_state as ArticleAnalysisDisplayState | null | undefined;
  if (state === "pending") {
    return "Analyse en attente";
  }
  if (state === "skipped_no_summary") {
    return "Sans analyse (résumé)";
  }
  if (state === "skipped_out_of_scope") {
    return "Hors périmètre analyse";
  }
  return null;
}

function previewGeneratedText(raw: string, maxChars = 380): string {
  const t = raw.replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  const withoutLeadingHash = t.replace(/^#{1,6}\s+[^\n]+\n?/m, "").trim() || t;
  if (withoutLeadingHash.length <= maxChars) return withoutLeadingHash;
  return `${withoutLeadingHash.slice(0, maxChars).trim()}…`;
}

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
  const fromApi = labelsFr?.[code]?.trim();
  if (fromApi) return fromApi;
  const name = previewsInGroup[0]?.country?.trim();
  if (name) return name;
  return code;
}

function TopicArticleLine({
  preview,
  selected,
  onToggle,
  compact,
  /** Le groupe parent affiche déjà le pays : pas de répétition drapeau / code / pays. */
  countryShownInGroupHeader,
}: {
  preview: TopicArticlePreview;
  selected: boolean;
  onToggle: (next: boolean) => void;
  compact?: boolean;
  countryShownInGroupHeader?: boolean;
}) {
  const { openArticle, prefetchArticle } = useArticleReader();
  const title = decodeHtmlEntities(
    (preview.title_fr || preview.title_original || "").trim(),
  );
  const typeFr = articleTypeLabelFr(preview.article_type);
  const cc = (preview.country_code ?? "").trim().toUpperCase();
  const flag = cc && cc !== "XX" ? REGION_FLAG_EMOJI[cc] : null;
  return (
    <div className="py-3 text-[13px] first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1.5 size-[15px] shrink-0 border-border"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Inclure ${title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {countryShownInGroupHeader ? (
              <>
                <span className="text-[12px] font-semibold text-foreground">
                  {preview.media_name}
                </span>
                {preview.author?.trim() ? (
                  <span className="text-[12px] text-muted-foreground">· {preview.author.trim()}</span>
                ) : null}
                {typeFr ? <span className="olj-type-chip">{typeFr}</span> : null}
                {(() => {
                  const b = analysisQueueBadge(preview);
                  if (!b) return null;
                  return (
                    <span
                      className="inline-flex max-w-[min(100%,14rem)] truncate rounded border border-border/60 bg-muted/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                      title={b}
                    >
                      {b}
                    </span>
                  );
                })()}
              </>
            ) : (
              <>
                {flag ? (
                  <span className="text-[13px] leading-none" aria-hidden>
                    {flag}
                  </span>
                ) : null}
                <span className="text-[12px] font-semibold text-foreground">
                  {preview.media_name}
                </span>
                {preview.country?.trim() ? (
                  <span className="text-[12px] text-muted-foreground">
                    {preview.country.trim()}
                  </span>
                ) : cc ? (
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {cc}
                  </span>
                ) : null}
                {preview.author?.trim() ? (
                  <span className="text-[12px] text-muted-foreground">· {preview.author.trim()}</span>
                ) : null}
                {typeFr ? <span className="olj-type-chip">{typeFr}</span> : null}
                {(() => {
                  const b = analysisQueueBadge(preview);
                  if (!b) return null;
                  return (
                    <span
                      className="inline-flex max-w-[min(100%,14rem)] truncate rounded border border-border/60 bg-muted/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
                      title={b}
                    >
                      {b}
                    </span>
                  );
                })()}
              </>
            )}
          </div>
          <span className="mt-1.5 block font-[family-name:var(--font-serif)] text-[15px] font-medium leading-snug text-foreground">
            {title}
          </span>
          {!compact && preview.thesis_summary_fr ? (
            <p className="mt-1 line-clamp-2 font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body">
              {preview.thesis_summary_fr}
            </p>
          ) : null}
          {!compact &&
          preview.analysis_bullets_fr &&
          preview.analysis_bullets_fr.length > 0 ? (
            <ul className="mt-2 space-y-1 text-[11px] leading-snug text-foreground-body">
              {preview.analysis_bullets_fr.slice(0, 3).map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-px shrink-0 text-[10px] font-semibold text-accent" aria-hidden>
                    {i + 1}.
                  </span>
                  <span className="line-clamp-2">{b}</span>
                </li>
              ))}
              {preview.analysis_bullets_fr.length > 3 ? (
                <li className="text-[10px] text-muted-foreground">
                  + {preview.analysis_bullets_fr.length - 3} idée
                  {preview.analysis_bullets_fr.length - 3 > 1 ? "s" : ""} dans la fiche
                </li>
              ) : null}
            </ul>
          ) : null}
          {!compact ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span className="min-w-0">
                {formatArticleMetaLine({
                  mediaName: preview.media_name,
                  country: preview.country,
                  articleType: preview.article_type,
                  sourceLanguage: preview.source_language,
                  author: preview.author,
                })}
              </span>
              {preview.editorial_angle ? (
                <span className="block w-full text-[10px] leading-snug text-foreground-subtle">
                  {preview.editorial_angle}
                </span>
              ) : null}
              {preview.is_flagship ? (
                <span className="inline-flex rounded-full border border-accent/35 bg-accent/5 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {FLAGSHIP_BADGE_LABEL}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="olj-btn-secondary px-2 py-0.5 text-[10px] disabled:opacity-50"
              onMouseEnter={() => prefetchArticle(preview.id)}
              onFocus={() => prefetchArticle(preview.id)}
              onClick={() => openArticle(preview.id)}
            >
              Lire
            </button>
            {preview.url ? (
              <a
                href={preview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="olj-focus text-[10px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
              >
                Source ↗
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function countriesInlineFromCodes(
  codes: string[],
  labelsFr?: Record<string, string> | null,
): string {
  if (!codes.length) return "";
  return codes
    .map((c) => {
      const u = c.trim().toUpperCase();
      const flag = REGION_FLAG_EMOJI[u];
      const name = labelsFr?.[u]?.trim() || u;
      return flag ? `${flag} ${name}` : name;
    })
    .join(" · ");
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
  const { openArticle, prefetchArticle } = useArticleReader();
  const [expanded, setExpanded] = useState(false);
  const [copiedGen, setCopiedGen] = useState(false);
  const previews = useMemo(
    () => topic.article_previews ?? [],
    [topic.article_previews],
  );
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
  const countriesText = countriesInlineFromCodes(
    derivedCodes,
    countryLabelsFr,
  );
  const articleTotal = topic.article_count ?? previews.length;
  const nCountryCodes = derivedCodes.length;
  const contrasting = pickContrastingPreviews(previews, 3);
  const showContrastingBlock =
    mode === "summary" && previews.length > 0 && contrasting.length >= 2;

  const groups = useMemo(() => groupVisibleByCountry(visible), [visible]);

  const displayRank = topic.user_rank ?? topic.rank;

  const topicTitle = topic.title_final ?? topic.title_proposed;

  const titleNode =
    mode === "summary" && editionDate ? (
      <h2 className="font-[family-name:var(--font-serif)] text-[17px] font-semibold leading-snug tracking-tight text-foreground sm:text-[19px]">
        <Link
          href={`/edition/${editionDate}/topic/${topic.id}`}
          title={`Fiche sujet — ${topicTitle}`}
          className="hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {topicTitle}
        </Link>
      </h2>
    ) : (
      <h2 className="max-w-3xl font-[family-name:var(--font-serif)] text-[20px] font-semibold leading-snug tracking-tight text-foreground sm:text-[21px]">
        {topicTitle}
      </h2>
    );

  const sectionClass =
    mode === "summary"
      ? "border-b border-border pb-10 pt-6"
      : "border-b border-border pb-12 pt-6";

  return (
    <section className={sectionClass}>
      <div
        className={cn(
          "grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10",
          mode === "summary" ? "lg:items-stretch" : "lg:items-start",
        )}
      >
        <div className="min-w-0">
          <div
            className={cn(
              "space-y-4",
              mode === "summary" && "lg:sticky lg:top-28 lg:z-10",
            )}
          >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className="shrink-0 tabular-nums text-[11px] font-semibold text-muted-foreground"
              title="Rang dans le sommaire (1 en tête), selon l’ordre éditorial enregistré."
            >
              Sujet {displayRank}
            </span>
            {titleNode}
          </div>
          {mode === "summary" && editionDate ? (
            (() => {
              const withBullets = previews.find(
                (p) => p.analysis_bullets_fr && p.analysis_bullets_fr.length > 0,
              );
              const bullets = withBullets?.analysis_bullets_fr?.slice(0, 2) ?? [];
              if (bullets.length === 0) return null;
              return (
                <ul className="mt-2 max-w-xl space-y-1 text-[11px] leading-snug text-foreground-body">
                  {bullets.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-semibold tabular-nums text-accent">
                        {i + 1}.
                      </span>
                      <span className="line-clamp-2">{b}</span>
                    </li>
                  ))}
                </ul>
              );
            })()
          ) : null}
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
          {(() => {
            const withBullets = previews.find(
              (p) => p.analysis_bullets_fr && p.analysis_bullets_fr.length > 0,
            );
            const bullets = withBullets?.analysis_bullets_fr?.slice(0, 2) ?? [];
            if (bullets.length === 0) {
              return null;
            }
            return (
              <ul className="max-w-xl space-y-1.5 rounded-md bg-muted/15 p-3 text-[12px] leading-relaxed text-foreground-body">
                {bullets.map((b, i) => (
                  <li key={i} className="break-inside-avoid">
                    {b}
                  </li>
                ))}
              </ul>
            );
          })()}
          <div className="flex flex-wrap items-center gap-2">
            {topic.is_multi_perspective ? (
              <span className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground-body">
                Plusieurs regards
                {nCountryCodes > 1
                  ? ` · ${nCountryCodes} pays`
                  : nCountryCodes === 1
                    ? " · 1 pays"
                    : null}
                {articleTotal > 0
                  ? ` · ${articleTotal} texte${articleTotal > 1 ? "s" : ""}`
                  : null}
              </span>
            ) : (
              <span className="inline-flex rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground-body">
                Point de vue national
              </span>
            )}
            {nCountryCodes === 1 && articleTotal <= 1 ? (
              <span className="inline-flex rounded-md border border-border bg-muted/30 px-2 py-1 text-[10px] font-medium text-foreground-body">
                Perspective unique
              </span>
            ) : null}
            {countriesText ? (
              <span className="text-[12px] text-foreground-body">
                {countriesText}
              </span>
            ) : null}
            {topic.article_count != null && !topic.is_multi_perspective ? (
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {topic.article_count} texte{topic.article_count > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          {showContrastingBlock ? (
            <ul className="space-y-3 border-t border-border-light pt-4">
              {contrasting.map((p) => {
                const cc = (p.country_code ?? "").trim().toUpperCase() || "";
                const flag = REGION_FLAG_EMOJI[cc];
                const place = p.country?.trim() || cc || "Région";
                const typeFr = articleTypeLabelFr(p.article_type);
                const journal = p.media_name?.trim();
                return (
                  <li
                    key={p.id}
                    className="border-b border-border-light pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
                      {journal ? (
                        <span className="font-semibold text-foreground">
                          {journal}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {flag ? `${flag} ${place}` : place}
                      </span>
                      {typeFr ? <span className="olj-type-chip">{typeFr}</span> : null}
                    </div>
                    {p.thesis_summary_fr ? (
                      <p className="mt-1.5 font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body line-clamp-2">
                        {p.thesis_summary_fr}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="olj-btn-secondary px-2 py-0.5 text-[10px]"
                        onMouseEnter={() => prefetchArticle(p.id)}
                        onFocus={() => prefetchArticle(p.id)}
                        onClick={() => openArticle(p.id)}
                      >
                        Lire
                      </button>
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="olj-focus text-[10px] text-muted-foreground underline decoration-border underline-offset-[3px] hover:text-foreground"
                        >
                          Source ↗
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {topic.generated_text?.trim() ? (
            <div className="max-w-xl space-y-2 rounded-md border border-border/50 bg-muted/10 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Texte pour la revue
              </p>
              <p className="line-clamp-5 whitespace-pre-wrap font-[family-name:var(--font-serif)] text-[13px] leading-relaxed text-foreground-body">
                {previewGeneratedText(topic.generated_text)}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-0.5">
                <button
                  type="button"
                  className="olj-link-action text-[12px]"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        topic.generated_text!.trim(),
                      );
                      setCopiedGen(true);
                      window.setTimeout(() => setCopiedGen(false), 2000);
                    } catch {
                      setCopiedGen(false);
                    }
                  }}
                >
                  {copiedGen ? "Copié" : "Copier le texte"}
                </button>
                {editionDate ? (
                  <Link
                    href={`/edition/${editionDate}/compose`}
                    className="olj-link-action text-[12px]"
                  >
                    Lire la suite dans Rédaction
                  </Link>
                ) : null}
              </div>
            </div>
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
        </div>

        <div className="min-w-0 lg:pl-6">
          {groups.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Aucun aperçu d’article pour ce sujet.
            </p>
          ) : (
            groups.map(([code, list]) => {
              const header = countryHeaderLabel(code, list, countryLabelsFr);
              const flag = code !== "—" ? REGION_FLAG_EMOJI[code] : null;
              const shown = list.slice(0, MAX_ARTICLES_PER_COUNTRY);
              const more = list.length - shown.length;
              const inEditionSummary = mode === "summary";
              return (
                <div
                  key={code || "x"}
                  className="mb-8 border-b border-border-light pb-8 last:mb-0 last:border-b-0 last:pb-0"
                >
                  <p className="mb-3 flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                    {flag ? (
                      <span className="text-[13px] leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}
                    {header}
                  </p>
                  <div className="divide-y divide-border-light">
                    {shown.map((p) => (
                      <TopicArticleLine
                        key={p.id}
                        preview={p}
                        selected={selectedIds.has(p.id)}
                        onToggle={(next) => onToggleArticle(p.id, next)}
                        compact={false}
                        countryShownInGroupHeader={inEditionSummary}
                      />
                    ))}
                  </div>
                  {more > 0 ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {more === 1
                        ? `+ 1 autre texte (${header})`
                        : `+ ${more} autres textes (${header})`}
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
          {restCount === 1
            ? "Voir 1 autre article sur ce sujet"
            : `Voir ${restCount} autres articles sur ce sujet`}
        </button>
      )}
      {!expanded && restCount > 0 && mode === "summary" && (
        <button
          type="button"
          className="olj-link-action mt-4 text-[12px]"
          onClick={() => setExpanded(true)}
        >
          {restCount === 1
            ? "Déplier 1 texte supplémentaire"
            : `Déplier ${restCount} textes supplémentaires`}
        </button>
      )}
    </section>
  );
}
