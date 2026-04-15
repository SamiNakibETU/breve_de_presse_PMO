"use client";

/**
 * TopicSection — Sujet dans le sommaire d'édition.
 *
 * Colonne gauche (sticky en mode summary) :
 *   SUJET N                   ← section label
 *   ══════════════════════════ ← rule-strong
 *   Titre éditorial           ← serif semibold
 *   "Thèse dominante..."      ← italic serif
 *   ┃ 1. Point clé            ← filet accent (AnalysisBullets)
 *   🇱🇧 🇺🇸 · 5 articles       ← méta pays
 *
 * Colonne droite :
 *   LIBAN 🇱🇧                  ← header pays
 *   ┌──────────────────────┐
 *   │ AN-NAHAR · Editorial  │  ← card article
 *   │ Titre...              │
 *   │ "Thèse..."            │
 *   │ 87%  Lire  Source ↗   │
 *   └──────────────────────┘
 */

import { ChevronDown, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useArticleReader } from "@/contexts/article-reader";
import {
  FLAGSHIP_BADGE_LABEL,
  articleTypeLabelFr,
} from "@/lib/article-labels-fr";
import { relevanceBandLabelFr } from "@/lib/article-relevance-display";
import { formatDateTimeBeirutFr } from "@/lib/dates-display-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { countryCodesFromPreviews } from "@/lib/topic-country-codes";
import type {
  ArticleAnalysisDisplayState,
  EditionTopic,
  TopicArticlePreview,
} from "@/lib/types";
import { decodeHtmlEntities } from "@/lib/text-utils";
import {
  SectionLabel,
  AnalysisBullets,
} from "@/components/ui/editorial-primitives";
import { cn } from "@/lib/utils";

export const VISIBLE_PER_TOPIC = 3;

function analysisQueueBadge(preview: TopicArticlePreview): string | null {
  if (preview.analysis_display_state === "complete") return null;
  const hint = preview.analysis_display_hint_fr?.trim();
  if (hint) return hint;
  const state = preview.analysis_display_state as ArticleAnalysisDisplayState | null | undefined;
  if (state === "pending") return "Analyse en attente";
  if (state === "skipped_no_summary") return "Sans analyse (résumé)";
  if (state === "skipped_out_of_scope") return "Hors périmètre";
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
const MAX_TOPIC_ANALYSIS_BULLETS = 5;

/** Puces d’analyse agrégées sur le sujet (jusqu’à 5, sans doublon exact). */
function aggregateAnalysisBullets(
  previews: TopicArticlePreview[],
  max: number,
): string[] {
  const out: string[] = [];
  for (const p of previews) {
    const bs = p.analysis_bullets_fr ?? [];
    for (const b of bs) {
      const t = String(b).trim();
      if (!t) continue;
      if (out.some((x) => x === t)) continue;
      out.push(t);
      if (out.length >= max) return out;
    }
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

/* ── Card article dans la colonne droite ────────────────────── */

function TopicArticleCard({
  preview,
  selected,
  onToggle,
  countryShownInGroupHeader,
}: {
  preview: TopicArticlePreview;
  selected: boolean;
  onToggle: (next: boolean) => void;
  countryShownInGroupHeader?: boolean;
}) {
  const { openArticle, prefetchArticle } = useArticleReader();
  const title = decodeHtmlEntities(
    (preview.title_fr || preview.title_original || "").trim(),
  );
  const typeFr = articleTypeLabelFr(preview.article_type);
  const cc = (preview.country_code ?? "").trim().toUpperCase();
  const flag = cc && cc !== "XX" ? REGION_FLAG_EMOJI[cc] : null;
  const isEditorial = ["opinion", "editorial", "tribune"].includes(
    (preview.article_type ?? "").toLowerCase(),
  );
  const pertinenceLabel =
    preview.editorial_relevance != null
      ? relevanceBandLabelFr(null, preview.editorial_relevance)
      : null;
  const badge = analysisQueueBadge(preview);

  return (
    <div
      className={cn(
        "group relative rounded-lg border px-4 py-3.5",
        "transition-all [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out-expo)]",
        "hover:shadow-low hover:-translate-y-px",
        selected
          ? "border-accent/35 bg-accent-tint/40"
          : "border-border bg-card hover:border-border/80",
      )}
    >
      {/* Checkbox + header */}
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          className="olj-focus mt-[3px] size-[14px] shrink-0"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Inclure ${title}`}
          style={{ accentColor: "var(--color-accent)" }}
        />
        <div className="min-w-0 flex-1">
          {/* Méta : media · type · date */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {!countryShownInGroupHeader && flag ? (
              <span className="text-[13px] leading-none" aria-hidden>{flag}</span>
            ) : null}
            <span className="text-[12px] font-semibold text-foreground">
              {preview.media_name}
            </span>
            {!countryShownInGroupHeader && preview.country?.trim() ? (
              <span className="text-[11px] text-muted-foreground">
                {preview.country.trim()}
              </span>
            ) : null}
            {preview.author?.trim() ? (
              <span className="text-[11px] text-muted-foreground">
                · {preview.author.trim()}
              </span>
            ) : null}
            {typeFr ? (
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide",
                  isEditorial ? "text-accent" : "text-muted-foreground",
                )}
              >
                {typeFr}
              </span>
            ) : null}
            {preview.is_flagship ? (
              <span
                className="inline-block size-1.5 rounded-full bg-accent"
                title={FLAGSHIP_BADGE_LABEL}
              />
            ) : null}
            {preview.collected_at ? (
              <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/60">
                {formatDateTimeBeirutFr(preview.collected_at)}
              </span>
            ) : null}
          </div>

          {/* Titre */}
          <p className="font-[family-name:var(--font-serif)] text-[14px] font-semibold leading-snug text-foreground">
            {title}
          </p>

          {/* Thèse */}
          {preview.thesis_summary_fr ? (
            <p className="mt-1.5 font-[family-name:var(--font-serif)] text-[12px] italic leading-relaxed text-foreground-body line-clamp-2">
              {preview.thesis_summary_fr}
            </p>
          ) : null}

          {/* Puces analyse — max 2 */}
          {preview.analysis_bullets_fr && preview.analysis_bullets_fr.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {preview.analysis_bullets_fr.slice(0, 5).map((b, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-foreground-body">
                  <span className="mt-px shrink-0 font-bold text-accent">{i + 1}.</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Actions + pertinence */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              className="olj-btn-secondary px-2.5 py-1 text-[10px] disabled:opacity-50"
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
                className="olj-link-action text-[10px]"
              >
                Source ↗
              </a>
            ) : null}
            {pertinenceLabel && (
              <span className="ml-auto text-[10px] text-muted-foreground/70">
                {pertinenceLabel}
              </span>
            )}
            {badge ? (
              <span
                className="inline-flex truncate rounded border border-border/60 bg-muted/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground max-w-[12rem]"
                title={badge}
              >
                {badge}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── TopicSection principal ─────────────────────────────────── */

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
  countryLabelsFr?: Record<string, string> | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copiedGen, setCopiedGen] = useState(false);

  const previews = useMemo(() => topic.article_previews ?? [], [topic.article_previews]);
  const maxPreview =
    mode === "summary"
      ? expanded ? previews.length : SUMMARY_PREVIEW_COUNT
      : expanded ? previews.length : VISIBLE_PER_TOPIC;
  const visible = previews.slice(0, maxPreview);
  const restCount =
    mode === "summary"
      ? Math.max(0, previews.length - SUMMARY_PREVIEW_COUNT)
      : Math.max(0, previews.length - VISIBLE_PER_TOPIC);

  const derivedCodes = useMemo(() => countryCodesFromPreviews(previews), [previews]);
  const countriesText = countriesInlineFromCodes(derivedCodes, countryLabelsFr);
  const articleTotal = topic.article_count ?? previews.length;
  const nCountryCodes = derivedCodes.length;

  const groups = useMemo(() => groupVisibleByCountry(visible), [visible]);
  const displayRank = topic.user_rank ?? topic.rank;
  const topicTitle = topic.title_final ?? topic.title_proposed;

  /* Image hero non disponible via TopicArticlePreview — champ image_url absent */

  const analysisBullets = useMemo(
    () => aggregateAnalysisBullets(previews, MAX_TOPIC_ANALYSIS_BULLETS),
    [previews],
  );

  /* These dominante */
  const dominantThesis =
    previews.find((p) => p.thesis_summary_fr?.trim())?.thesis_summary_fr?.trim() ?? null;

  /* Plage de dates des articles du sujet */
  const dateRange = useMemo(() => {
    const ts = previews
      .map((p) => p.collected_at ? new Date(p.collected_at).getTime() : null)
      .filter((t): t is number => t !== null);
    if (ts.length === 0) return null;
    const minTs = Math.min(...ts);
    const maxTs = Math.max(...ts);
    const minStr = formatDateTimeBeirutFr(new Date(minTs).toISOString());
    if (Math.abs(maxTs - minTs) < 3_600_000) return minStr;
    const maxStr = formatDateTimeBeirutFr(new Date(maxTs).toISOString());
    return `${minStr} → ${maxStr}`;
  }, [previews]);

  /* Lien vers fiche sujet */
  const topicLink =
    mode === "summary" && editionDate ? `/edition/${editionDate}/topic/${topic.id}` : null;

  return (
    <section className={cn(
      "border-b border-border",
      mode === "summary" ? "pb-10 pt-8" : "pb-12 pt-8",
    )}>
      <div className={cn(
        "grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12",
        mode === "summary" ? "lg:items-stretch" : "lg:items-start",
      )}>
        {/* ── COLONNE GAUCHE ───────────────────────────────── */}
        <div className="min-w-0">
          <div className={cn(
            "space-y-4",
            mode === "summary" && "lg:sticky lg:top-28 lg:z-10",
          )}>
            {/* Label sujet */}
            <SectionLabel>Sujet {displayRank}</SectionLabel>

            {/* Titre */}
            <div>
              {topicLink ? (
                <h2 className="font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-snug tracking-tight text-foreground sm:text-[21px]">
                  <Link
                    href={topicLink}
                    className="hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {topicTitle}
                  </Link>
                </h2>
              ) : (
                <h2 className="max-w-3xl font-[family-name:var(--font-serif)] text-[21px] font-semibold leading-snug tracking-tight text-foreground sm:text-[22px]">
                  {topicTitle}
                </h2>
              )}
            </div>

            {/* Thèse dominante */}
            {dominantThesis && (
              <p className="max-w-xl font-[family-name:var(--font-serif)] text-[14px] italic leading-relaxed text-foreground-body">
                {dominantThesis}
              </p>
            )}

            {/* Angle / description */}
            {(topic.angle_summary?.trim() || topic.description?.trim()) && (
              <div className="max-w-xl space-y-1.5 text-[13px] leading-relaxed text-foreground-body">
                {topic.angle_summary?.trim() && (
                  <p className="line-clamp-3 font-[family-name:var(--font-serif)] text-[13px] text-foreground">
                    {topic.angle_summary.trim()}
                  </p>
                )}
                {topic.description?.trim() &&
                  topic.description.trim() !== topic.angle_summary?.trim() && (
                    <p className="line-clamp-3">{topic.description.trim()}</p>
                  )}
              </div>
            )}

            {/* Puces analyse avec filet accent */}
            {analysisBullets.length > 0 && (
              <AnalysisBullets
                bullets={analysisBullets}
                maxVisible={MAX_TOPIC_ANALYSIS_BULLETS}
                className="max-w-xl"
              />
            )}

            {/* Badges perspective + pays */}
            <div className="flex flex-wrap items-center gap-1.5">
              {topic.is_multi_perspective ? (
                <span className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground-body">
                  Plusieurs regards
                  {nCountryCodes > 1 ? ` · ${nCountryCodes} pays` : nCountryCodes === 1 ? " · 1 pays" : null}
                  {articleTotal > 0 ? ` · ${articleTotal} texte${articleTotal > 1 ? "s" : ""}` : null}
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
                <span className="text-[12px] text-foreground-body">{countriesText}</span>
              ) : null}
            </div>
            {dateRange ? (
              <div className="max-w-xl rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Parution (collecte, Beyrouth)
                </p>
                <p className="mt-1 font-[family-name:var(--font-serif)] text-[14px] font-medium tabular-nums leading-snug text-foreground sm:text-[15px]">
                  {dateRange}
                </p>
              </div>
            ) : null}

            {/* Texte généré pour la revue */}
            {topic.generated_text?.trim() ? (
              <div className="max-w-xl rounded-lg border border-border/50 bg-muted/10 p-3.5 space-y-2">
                <SectionLabel>Texte pour la revue</SectionLabel>
                <p className="line-clamp-5 whitespace-pre-wrap font-[family-name:var(--font-serif)] text-[13px] leading-relaxed text-foreground-body">
                  {previewGeneratedText(topic.generated_text)}
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    className="olj-link-action text-[12px]"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(topic.generated_text!.trim());
                        setCopiedGen(true);
                        window.setTimeout(() => setCopiedGen(false), 2000);
                      } catch {
                        setCopiedGen(false);
                      }
                    }}
                  >
                    {copiedGen ? "Copié" : "Copier"}
                  </button>
                  {editionDate && (
                    <Link href={`/edition/${editionDate}/compose`} className="olj-link-action text-[12px]">
                      Voir dans Rédaction
                    </Link>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── COLONNE DROITE — cards articles ─────────────── */}
        <div className="min-w-0 lg:pl-4">
          {groups.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Aucun aperçu d&apos;article pour ce sujet.
            </p>
          ) : (
            <div className="space-y-6">
              {groups.map(([code, list]) => {
                const header = countryHeaderLabel(code, list, countryLabelsFr);
                const flag = code !== "—" ? REGION_FLAG_EMOJI[code] : null;
                const shown = list.slice(0, MAX_ARTICLES_PER_COUNTRY);
                const more = list.length - shown.length;
                const inEditionSummary = mode === "summary";

                return (
                  <div key={code || "x"}>
                    {/* Header pays */}
                    <div className="mb-3 flex items-center gap-2">
                      {flag && (
                        <span className="text-[16px] leading-none" aria-hidden>{flag}</span>
                      )}
                      <SectionLabel>{header}</SectionLabel>
                    </div>

                    {/* Cards articles */}
                    <div className="space-y-2.5">
                      {shown.map((p) => (
                        <TopicArticleCard
                          key={p.id}
                          preview={p}
                          selected={selectedIds.has(p.id)}
                          onToggle={(next) => onToggleArticle(p.id, next)}
                          countryShownInGroupHeader={inEditionSummary}
                        />
                      ))}
                    </div>

                    {more > 0 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {more === 1
                          ? `+ 1 autre texte (${header})`
                          : `+ ${more} autres textes (${header})`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Actions bas de section ───────────────────────── */}
      {mode === "summary" && editionDate ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 pt-2">
          <Link
            href={`/edition/${editionDate}/topic/${topic.id}`}
            className="olj-btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium sm:text-[12px]"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            Fiche sujet
          </Link>
          {!expanded && restCount > 0 ? (
            <button
              type="button"
              className="olj-focus inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:text-[12px]"
              onClick={() => setExpanded(true)}
            >
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {restCount === 1 ? "Déplier 1 texte de plus" : `Déplier ${restCount} textes de plus`}
            </button>
          ) : null}
        </div>
      ) : null}

      {!expanded && restCount > 0 && mode === "full" && (
        <button
          type="button"
          className="olj-focus mt-5 inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {restCount === 1
            ? "Voir 1 autre article sur ce sujet"
            : `Voir ${restCount} autres articles sur ce sujet`}
        </button>
      )}
    </section>
  );
}
