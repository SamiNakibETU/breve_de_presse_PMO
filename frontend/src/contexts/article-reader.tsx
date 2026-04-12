"use client";

/**
 * ArticleReader — Lecteur modal avec flux éditorial continu.
 *
 * Design : Ryo Lu — flux unique scrollable, pas d'onglets.
 * Les journalistes ne veulent pas cliquer pour trouver l'information.
 *
 * Ordre du contenu :
 *   Header (media · pays · date)
 *   Titre (serif semibold)
 *   ── séparateur ──
 *   THÈSE           → italic serif
 *   POINTS CLÉS     → puces avec filet accent
 *   CONTEXTE FACTUEL→ factual_context_fr
 *   RÉSUMÉ          → paragraphes avec lettrine
 *   CITATIONS       → italic serif fond muted
 *   ── séparateur ──
 *   Métadonnées techniques (tonalité, cadrage, angle)
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  articleTypeLabelFr,
  sourceLanguageLabelFr,
} from "@/lib/article-labels-fr";
import {
  formatAuthorDisplay,
  relevanceBandLabelFr,
} from "@/lib/article-relevance-display";
import { api } from "@/lib/api";
import { formatPublishedAtFr } from "@/lib/dates-display-fr";
import type { Article } from "@/lib/types";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import {
  decodeHtmlEntities,
  formatQuoteForDisplay,
} from "@/lib/text-utils";
import { normalizeBulletLine } from "@/lib/analysis-text-normalize";
import {
  bodyParagraphs,
  editorialBodySections,
  sanitizeTranslatedBodyForDisplay,
} from "@/lib/editorial-body";
import { SectionLabel } from "@/components/ui/editorial-primitives";
import { cn } from "@/lib/utils";

const ARTICLE_QUERY_STALE_MS = 60_000;

export const articleDetailQueryKey = (articleId: string) =>
  ["article", articleId] as const;

type ArticleReaderContextValue = {
  openArticle: (articleId: string) => void;
  prefetchArticle: (articleId: string) => void;
};

const ArticleReaderContext = createContext<ArticleReaderContextValue | null>(null);

export function ArticleReaderProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [articleId, setArticleId] = useState<string | null>(null);
  const openArticle = useCallback((id: string) => setArticleId(id), []);
  const close = useCallback(() => setArticleId(null), []);

  const prefetchArticle = useCallback(
    (id: string) => {
      if (!id.trim()) return;
      void queryClient.prefetchQuery({
        queryKey: articleDetailQueryKey(id),
        queryFn: () => api.articleById(id),
        staleTime: ARTICLE_QUERY_STALE_MS,
      });
    },
    [queryClient],
  );

  return (
    <ArticleReaderContext.Provider value={{ openArticle, prefetchArticle }}>
      {children}
      {articleId ? (
        <ArticleReadModal articleId={articleId} onClose={close} />
      ) : null}
    </ArticleReaderContext.Provider>
  );
}

export function useArticleReader(): ArticleReaderContextValue {
  const ctx = useContext(ArticleReaderContext);
  return {
    openArticle: ctx?.openArticle ?? (() => {}),
    prefetchArticle: ctx?.prefetchArticle ?? (() => {}),
  };
}

function buildSynthesisPlainText(a: Article): string {
  const parts: string[] = [];
  if (a.thesis_summary_fr?.trim()) {
    parts.push(`Thèse : ${a.thesis_summary_fr.trim()}`);
  }
  if (a.summary_fr?.trim()) {
    parts.push(`Résumé : ${a.summary_fr.trim()}`);
  }
  if (a.key_quotes_fr?.length) {
    parts.push(
      "Citations :\n" +
        a.key_quotes_fr
          .map((q) => `« ${formatQuoteForDisplay(q)} »`)
          .join("\n"),
    );
  }
  return parts.join("\n\n");
}

function ArticleReadModal({
  articleId,
  onClose,
}: {
  articleId: string;
  onClose: () => void;
}) {
  const [copiedSynth, setCopiedSynth] = useState(false);

  const q = useQuery({
    queryKey: articleDetailQueryKey(articleId),
    queryFn: () => api.articleById(articleId),
    enabled: Boolean(articleId),
    staleTime: ARTICLE_QUERY_STALE_MS,
  });

  useEffect(() => {
    setCopiedSynth(false);
  }, [articleId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a: Article | undefined = q.data;
  const title = a
    ? decodeHtmlEntities((a.title_fr?.trim() || a.title_original || "Article").trim())
    : "Article";
  const typeFr = articleTypeLabelFr(a?.article_type);
  const langFr = sourceLanguageLabelFr(a?.source_language);
  const hasBodyFr = Boolean(a?.content_translated_fr?.trim());
  const summaryOnly = Boolean(a?.en_translation_summary_only) && !hasBodyFr;
  const hasOriginalBody = Boolean(a?.content_original?.trim());
  const cc = (a?.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const authorLine = a ? formatAuthorDisplay(a.author) : null;
  const relevanceLbl =
    a != null ? relevanceBandLabelFr(a.relevance_band, a.editorial_relevance) : null;

  const hasBullets = Boolean(a?.analysis_bullets_fr?.length);
  const hasThesis = Boolean(a?.author_thesis_explicit_fr?.trim());
  const hasContext = Boolean(a?.factual_context_fr?.trim());
  const hasAnalysis = hasBullets || hasThesis || hasContext;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center motion-safe:animate-in motion-safe:fade-in-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-read-title"
    >
      {/* Overlay */}
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
        aria-label="Fermer"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative flex max-h-[min(92vh,52rem)] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-background shadow-high motion-safe:animate-in motion-safe:slide-in-from-bottom-4 sm:rounded-2xl sm:motion-safe:slide-in-from-bottom-0 sm:motion-safe:zoom-in-95">
        {/* En-tête fixe du panel */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          {typeFr ? (
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {typeFr}
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Lecture
            </span>
          )}
          <div className="flex items-center gap-2">
            {a?.url && (
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                className="olj-btn-secondary px-2.5 py-1 text-[11px]"
              >
                Source ↗
              </a>
            )}
            <button
              type="button"
              className="olj-btn-secondary px-2.5 py-1 text-[11px]"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {/* Corps scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
          {q.isPending ? (
            <div className="space-y-3" role="status" aria-label="Chargement">
              <div className="h-5 w-1/3 animate-pulse rounded bg-muted/60" />
              <div className="h-7 w-3/4 animate-pulse rounded bg-muted/50" />
              <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
              <div className="h-24 w-full animate-pulse rounded bg-muted/30" />
            </div>
          ) : q.isError ? (
            <p className="olj-alert-destructive px-3 py-2" role="alert">
              {q.error instanceof Error
                ? q.error.message
                : "Impossible de charger l'article."}
            </p>
          ) : a ? (
            <article className="space-y-5">
              {/* ── HEADER ──────────────────────────────────────── */}
              <header className="space-y-2">
                {/* Méta ligne : flag · pays · media · date */}
                <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
                  {flag && (
                    <span className="text-[16px] leading-none" aria-hidden>
                      {flag}
                    </span>
                  )}
                  {(a.country?.trim() || cc) && (
                    <span>{a.country?.trim() || cc}</span>
                  )}
                  <span className="text-border" aria-hidden>·</span>
                  <span className="font-semibold text-foreground">{a.media_name}</span>
                  {authorLine && (
                    <>
                      <span className="text-border" aria-hidden>·</span>
                      <span className="font-medium text-foreground-body">{authorLine}</span>
                    </>
                  )}
                  {a.published_at && (
                    <>
                      <span className="text-border" aria-hidden>·</span>
                      <time dateTime={a.published_at} className="tabular-nums">
                        {formatPublishedAtFr(a.published_at, "short")}
                      </time>
                    </>
                  )}
                  {langFr && (
                    <>
                      <span className="text-border" aria-hidden>·</span>
                      <span>{langFr}</span>
                    </>
                  )}
                </p>

                {/* Titre */}
                <h2
                  id="article-read-title"
                  className="font-[family-name:var(--font-serif)] text-[20px] font-semibold leading-snug text-foreground"
                >
                  {title}
                </h2>

                {/* Titre original si différent */}
                {a.title_fr && a.title_original && a.title_fr !== a.title_original && (
                  <p className="text-[11px] text-muted-foreground">
                    Titre d'origine : {decodeHtmlEntities(a.title_original)}
                  </p>
                )}

                {/* Pertinence + actions */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {relevanceLbl && (
                    <span className="inline-flex rounded border border-border bg-muted/20 px-2 py-0.5 text-[10px] font-medium text-foreground-body">
                      Pertinence : {relevanceLbl}
                    </span>
                  )}
                  <button
                    type="button"
                    className="olj-btn-secondary px-2.5 py-1 text-[11px] disabled:opacity-40"
                    disabled={!buildSynthesisPlainText(a).trim()}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(buildSynthesisPlainText(a));
                        setCopiedSynth(true);
                        window.setTimeout(() => setCopiedSynth(false), 2000);
                      } catch {
                        setCopiedSynth(false);
                      }
                    }}
                  >
                    {copiedSynth ? "Copié" : "Copier la synthèse"}
                  </button>
                  <Link
                    href={`/articles/${articleId}`}
                    className="olj-btn-secondary px-2.5 py-1 text-[11px]"
                    onClick={onClose}
                  >
                    Pleine page
                  </Link>
                </div>
              </header>

              {/* ── SÉPARATEUR ──────────────────────────────────── */}
              <hr className="border-t border-border" />

              {/* Avertissement état analyse */}
              {a.analysis_display_hint_fr &&
              a.analysis_display_state &&
              a.analysis_display_state !== "complete" ? (
                <p
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-[11px] leading-snug",
                    a.analysis_display_state.startsWith("skipped")
                      ? "border-border-light bg-muted/25 text-muted-foreground"
                      : "border-accent/20 bg-accent/5 text-foreground-body",
                  )}
                >
                  {a.analysis_display_hint_fr}
                </p>
              ) : null}

              {/* ── THÈSE ────────────────────────────────────────── */}
              {(a.author_thesis_explicit_fr?.trim() || a.thesis_summary_fr?.trim()) && (
                <section className="space-y-2">
                  <SectionLabel>Thèse</SectionLabel>
                  <p className="font-[family-name:var(--font-serif)] text-[15px] italic leading-relaxed text-foreground-body">
                    {(a.author_thesis_explicit_fr?.trim() || a.thesis_summary_fr?.trim())}
                  </p>
                </section>
              )}

              {/* ── POINTS CLÉS ───────────────────────────────────── */}
              {hasBullets && (
                <section className="space-y-2">
                  <SectionLabel>Points clés</SectionLabel>
                  <div className="border-l-2 border-accent bg-muted/20 py-3 pl-4 pr-3 rounded-r-md">
                    <ol className="space-y-2">
                      {a.analysis_bullets_fr!.map((b, i) => {
                        const line = normalizeBulletLine(b);
                        if (!line) return null;
                        return (
                          <li
                            key={i}
                            className="flex gap-2.5 text-[13px] leading-snug text-foreground-body"
                          >
                            <span className="mt-px shrink-0 text-[11px] font-bold tabular-nums text-accent">
                              {i + 1}.
                            </span>
                            <span>{line}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </section>
              )}

              {/* ── CONTEXTE FACTUEL ──────────────────────────────── */}
              {hasContext && (
                <section className="space-y-2">
                  <SectionLabel>Contexte factuel</SectionLabel>
                  <p className="text-[13px] leading-relaxed text-foreground-body">
                    {a.factual_context_fr!.trim()}
                  </p>
                </section>
              )}

              {/* Message si pas d'analyse */}
              {!hasAnalysis && !a.thesis_summary_fr?.trim() && (
                <p className="text-[13px] text-muted-foreground italic">
                  L'analyse structurée sera disponible après le prochain passage pipeline.
                </p>
              )}

              {/* ── RÉSUMÉ ───────────────────────────────────────── */}
              {a.summary_fr?.trim() && (
                <section className="space-y-2">
                  <SectionLabel>Résumé</SectionLabel>
                  <div className="space-y-3 rounded-md border border-border-light bg-surface-warm/20 px-4 py-3.5 font-[family-name:var(--font-serif)] text-[14px] leading-[1.8] text-foreground-body">
                    {bodyParagraphs(a.summary_fr.trim()).map((para, i) => (
                      <p
                        key={i}
                        className={
                          i === 0
                            ? "[&:first-letter]:float-left [&:first-letter]:mr-2 [&:first-letter]:font-[family-name:var(--font-serif)] [&:first-letter]:text-[3rem] [&:first-letter]:leading-[0.85] [&:first-letter]:text-accent"
                            : ""
                        }
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {/* ── CITATIONS ────────────────────────────────────── */}
              {a.key_quotes_fr && a.key_quotes_fr.length > 0 && (
                <section className="space-y-2">
                  <SectionLabel>Citations</SectionLabel>
                  <ul className="space-y-2.5 rounded-md border border-border-light bg-muted/10 px-4 py-3">
                    {a.key_quotes_fr.map((quote, i) => (
                      <li
                        key={i}
                        className="font-[family-name:var(--font-serif)] text-[13px] italic leading-relaxed text-foreground-subtle"
                      >
                        «&nbsp;{formatQuoteForDisplay(quote)}&nbsp;»
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* ── CORPS TRADUIT (si disponible) ─────────────────── */}
              {hasBodyFr && (
                <section className="space-y-2">
                  <SectionLabel>Traduction intégrale</SectionLabel>
                  <div className="rounded-md border border-border-light bg-surface-warm/20 px-4 py-4 font-[family-name:var(--font-serif)] text-[14px] leading-[1.85] text-foreground-body">
                    {editorialBodySections(
                      sanitizeTranslatedBodyForDisplay(a.content_translated_fr!.trim()),
                    ).map((sec, si) => (
                      <div
                        key={si}
                        className={si > 0 ? "mt-6 border-t border-border-light pt-6" : ""}
                      >
                        {sec.heading ? (
                          <p className="mb-3 font-semibold text-foreground">
                            {sec.heading}
                          </p>
                        ) : null}
                        {sec.paragraphs.map((para, i) => (
                          <p
                            key={i}
                            className={cn(
                              "mb-4 last:mb-0",
                              i === 0 && si === 0
                                ? "[&:first-letter]:float-left [&:first-letter]:mr-2 [&:first-letter]:text-[3.25rem] [&:first-letter]:leading-[0.85] [&:first-letter]:text-accent"
                                : "",
                            )}
                          >
                            {para}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {summaryOnly && !hasBodyFr && (
                <p className="text-[12px] text-muted-foreground">
                  Corps traduit non persisté (résumé seulement). Voir la source originale.
                </p>
              )}

              {!hasBodyFr && !summaryOnly && hasOriginalBody && (
                <section className="space-y-2">
                  <SectionLabel>Texte source (langue d'origine)</SectionLabel>
                  <div className="rounded-md border border-border-light bg-muted/20 px-4 py-3 font-[family-name:var(--font-serif)] text-[13px] leading-[1.75] text-foreground-body">
                    {bodyParagraphs(a.content_original!.trim()).map((para, i) => (
                      <p key={i} className="mb-3 last:mb-0">
                        {para}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {/* ── SÉPARATEUR ──────────────────────────────────── */}
              <hr className="border-t border-border" />

              {/* ── MÉTADONNÉES TECHNIQUES ───────────────────────── */}
              <footer className="space-y-1 text-[11px] text-muted-foreground">
                {a.analysis_tone && (
                  <p><span className="font-medium text-foreground-body">Tonalité : </span>{a.analysis_tone}</p>
                )}
                {a.fact_opinion_quality && (
                  <p><span className="font-medium text-foreground-body">Fait / opinion : </span>{a.fact_opinion_quality}</p>
                )}
                {a.framing_actor && (
                  <p><span className="font-medium text-foreground-body">Angle : </span>{a.framing_actor}</p>
                )}
                {a.framing_tone && (
                  <p><span className="font-medium text-foreground-body">Registre : </span>{a.framing_tone}</p>
                )}
                {a.framing_prescription && (
                  <p><span className="font-medium text-foreground-body">Proposition : </span>{a.framing_prescription}</p>
                )}
                {a.editorial_angle?.trim() && (
                  <p><span className="font-medium text-foreground-body">Angle éditorial : </span>{a.editorial_angle.trim()}</p>
                )}
              </footer>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
