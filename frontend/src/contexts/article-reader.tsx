"use client";

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
import { cn } from "@/lib/utils";

const ARTICLE_QUERY_STALE_MS = 60_000;

export const articleDetailQueryKey = (articleId: string) =>
  ["article", articleId] as const;

type ArticleReaderContextValue = {
  openArticle: (articleId: string) => void;
  prefetchArticle: (articleId: string) => void;
};

const ArticleReaderContext = createContext<ArticleReaderContextValue | null>(
  null,
);

export function ArticleReaderProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [articleId, setArticleId] = useState<string | null>(null);
  const openArticle = useCallback((id: string) => {
    setArticleId(id);
  }, []);
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

/** Actions lecteur article ; no-op si hors provider. */
export function useArticleReader(): ArticleReaderContextValue {
  const ctx = useContext(ArticleReaderContext);
  return {
    openArticle: ctx?.openArticle ?? (() => {}),
    prefetchArticle: ctx?.prefetchArticle ?? (() => {}),
  };
}

type ReaderTab = "analysis" | "synthesis" | "body" | "source";

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
  const [tab, setTab] = useState<ReaderTab>("synthesis");
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
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const a: Article | undefined = q.data;

  useEffect(() => {
    if (!a) {
      return;
    }
    const hasAnalysis =
      (a.analysis_bullets_fr && a.analysis_bullets_fr.length > 0) ||
      Boolean(a.author_thesis_explicit_fr?.trim()) ||
      Boolean(a.factual_context_fr?.trim());
    setTab(hasAnalysis ? "analysis" : "synthesis");
  }, [a]);

  const title = a
    ? decodeHtmlEntities(
        (a.title_fr?.trim() || a.title_original || "Article").trim(),
      )
    : "Article";
  const titleOriginalDisplay = a
    ? decodeHtmlEntities(a.title_original || "")
    : "";
  const typeFr = articleTypeLabelFr(a?.article_type);
  const langFr = sourceLanguageLabelFr(a?.source_language);
  const hasBodyFr = Boolean(a?.content_translated_fr?.trim());
  const summaryOnly =
    Boolean(a?.en_translation_summary_only) && !hasBodyFr;
  const hasOriginalBody = Boolean(a?.content_original?.trim());
  const hasAnalysisTab =
    Boolean(a?.analysis_bullets_fr?.length) ||
    Boolean(a?.author_thesis_explicit_fr?.trim()) ||
    Boolean(a?.factual_context_fr?.trim());
  const cc = (a?.country_code ?? "").trim().toUpperCase();
  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
  const authorLine = a ? formatAuthorDisplay(a.author) : null;
  const relevanceLbl =
    a != null
      ? relevanceBandLabelFr(a.relevance_band, a.editorial_relevance)
      : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="article-read-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="relative flex max-h-[min(92vh,48rem)] w-full max-w-2xl flex-col rounded-t-lg border border-border bg-background shadow-lg sm:rounded-lg">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <p className="olj-rubric">Lecture article</p>
          <button
            type="button"
            className="olj-btn-secondary shrink-0 px-2 py-1 text-[11px]"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {q.isPending ? (
            <div className="space-y-3" role="status" aria-label="Chargement">
              <div className="h-6 w-3/4 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
              <div className="h-32 w-full animate-pulse rounded bg-muted/30" />
            </div>
          ) : q.isError ? (
            <p className="olj-alert-destructive px-3 py-2" role="alert">
              {q.error instanceof Error
                ? q.error.message
                : "Impossible de charger l’article."}
            </p>
          ) : a ? (
            <article className="space-y-4 text-[13px] leading-relaxed text-foreground-body">
              <header className="space-y-2 border-b border-border-light pb-4">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  {flag ? (
                    <span className="text-[1.1rem] leading-none" aria-hidden>
                      {flag}
                    </span>
                  ) : null}
                  <span>{a.country?.trim() || cc || "—"}</span>
                  <span>·</span>
                  <span className="font-medium text-foreground">{a.media_name}</span>
                  {typeFr ? (
                    <>
                      <span>·</span>
                      <span className="rounded-sm bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                        {typeFr}
                      </span>
                    </>
                  ) : null}
                  {a.published_at ? (
                    <>
                      <span>·</span>
                      <time
                        dateTime={a.published_at}
                        className="tabular-nums text-[11px]"
                      >
                        {formatPublishedAtFr(a.published_at, "short")}
                      </time>
                    </>
                  ) : null}
                </p>
                <h2
                  id="article-read-title"
                  className="font-[family-name:var(--font-serif)] text-[19px] font-semibold leading-snug text-foreground"
                >
                  {title}
                </h2>
                {a.title_fr &&
                a.title_original &&
                a.title_fr !== a.title_original ? (
                  <p className="text-[12px] text-muted-foreground">
                    Titre d’origine : {titleOriginalDisplay}
                  </p>
                ) : null}
                <p className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  {authorLine ? (
                    <span className="font-medium text-foreground">{authorLine}</span>
                  ) : null}
                  {langFr ? (
                    <span>
                      {authorLine ? " · " : null}
                      {langFr}
                    </span>
                  ) : null}
                </p>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="olj-link-action inline-block text-[12px]"
                  >
                    Ouvrir la source originale ↗
                  </a>
                ) : null}
              </header>

              <div
                className="flex flex-wrap gap-1 border-b border-border-light pb-3"
                role="tablist"
                aria-label="Mode de lecture"
              >
                {(
                  [
                    ["analysis", "Analyse"],
                    ["synthesis", "Synthèse"],
                    ["body", "Corps"],
                    ["source", "Source"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors sm:px-3",
                      tab === k
                        ? "bg-accent/12 text-accent"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    onClick={() => setTab(k)}
                  >
                    {label}
                    {k === "analysis" && hasAnalysisTab ? (
                      <span
                        className="inline-block size-1.5 shrink-0 rounded-full bg-accent"
                        title="Analyse structurée disponible"
                        aria-hidden
                      />
                    ) : null}
                    {k === "body" && hasBodyFr ? (
                      <span
                        className="inline-block size-1.5 shrink-0 rounded-full bg-accent"
                        title="Corps traduit disponible"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                ))}
              </div>

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
                  title="Analyse"
                >
                  {a.analysis_display_hint_fr}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2 border-b border-border-light pb-3">
                <Link
                  href={`/articles/${articleId}`}
                  className="olj-btn-secondary inline-flex px-3 py-1.5 text-[11px]"
                  onClick={onClose}
                >
                  Ouvrir en pleine page
                </Link>
              </div>

              {tab === "analysis" ? (
                <section className="space-y-4">
                  {a.factual_context_fr?.trim() ? (
                    <section>
                      <p className="olj-rubric mb-2">Contexte factuel</p>
                      <p className="text-[13px] leading-relaxed text-foreground-body">
                        {a.factual_context_fr.trim()}
                      </p>
                    </section>
                  ) : null}
                  {a.author_thesis_explicit_fr?.trim() ? (
                    <section>
                      <p className="olj-rubric mb-2">Thèse (attribution)</p>
                      <p className="font-[family-name:var(--font-serif)] text-[14px] italic leading-relaxed text-foreground">
                        {a.author_thesis_explicit_fr.trim()}
                      </p>
                    </section>
                  ) : null}
                  {a.analysis_bullets_fr && a.analysis_bullets_fr.length > 0 ? (
                    <section>
                      <p className="olj-rubric mb-2">Idées majeures</p>
                      <ol className="list-decimal space-y-3 pl-5 text-[13px] text-foreground-body marker:font-semibold marker:text-accent">
                        {a.analysis_bullets_fr.map((b, i) => {
                          const line = normalizeBulletLine(b);
                          if (!line) {
                            return null;
                          }
                          return (
                            <li key={i} className="whitespace-pre-wrap pl-1">
                              {line}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ) : null}
                  {a.analysis_tone || a.fact_opinion_quality ? (
                    <p className="text-[11px] text-muted-foreground">
                      {a.analysis_tone ? `Tonalité : ${a.analysis_tone}. ` : null}
                      {a.fact_opinion_quality
                        ? `Séparation fait / opinion : ${a.fact_opinion_quality}.`
                        : null}
                    </p>
                  ) : null}
                  {!a.factual_context_fr?.trim() &&
                  !a.author_thesis_explicit_fr?.trim() &&
                  !(a.analysis_bullets_fr && a.analysis_bullets_fr.length > 0) &&
                  !a.thesis_summary_fr?.trim() ? (
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      L’analyse (faits, thèse, idées majeures) sera disponible après le
                      prochain passage pipeline ou une relance depuis la régie. En attendant,
                      consultez l’onglet{" "}
                      <strong className="font-medium text-foreground">Synthèse</strong>.
                    </p>
                  ) : null}
                  {!a.factual_context_fr?.trim() &&
                  !a.author_thesis_explicit_fr?.trim() &&
                  !(a.analysis_bullets_fr && a.analysis_bullets_fr.length > 0) &&
                  a.thesis_summary_fr?.trim() ? (
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      Pas encore d’analyse structurée : la thèse et le résumé sont dans l’onglet{" "}
                      <strong className="font-medium text-foreground">Synthèse</strong>.
                    </p>
                  ) : null}
                </section>
              ) : tab === "synthesis" ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {relevanceLbl ? (
                      <span className="inline-flex rounded-md border border-border bg-muted/20 px-2 py-1 text-[10px] font-medium text-foreground-body">
                        Pertinence : {relevanceLbl}
                      </span>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      className="olj-btn-secondary px-2 py-1 text-[11px] disabled:opacity-40"
                      disabled={!a || !buildSynthesisPlainText(a).trim()}
                      onClick={async () => {
                        if (!a) return;
                        try {
                          await navigator.clipboard.writeText(
                            buildSynthesisPlainText(a),
                          );
                          setCopiedSynth(true);
                          window.setTimeout(() => setCopiedSynth(false), 2000);
                        } catch {
                          setCopiedSynth(false);
                        }
                      }}
                    >
                      {copiedSynth ? "Copié" : "Copier la synthèse"}
                    </button>
                  </div>
                  {a.thesis_summary_fr?.trim() ? (
                    <section>
                      <p className="olj-rubric mb-2">Thèse</p>
                      <p className="font-[family-name:var(--font-serif)] text-[14px] italic leading-relaxed text-foreground">
                        {a.thesis_summary_fr.trim()}
                      </p>
                    </section>
                  ) : null}

                  {a.summary_fr?.trim() ? (
                    <section>
                      <p className="olj-rubric mb-2">Résumé</p>
                      <div className="space-y-3 font-[family-name:var(--font-serif)] text-[14px] leading-[1.75] text-foreground-body">
                        {bodyParagraphs(a.summary_fr.trim()).map((para, i) => (
                          <p key={i}>{para}</p>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {!a.thesis_summary_fr?.trim() && !a.summary_fr?.trim() ? (
                    <p className="text-muted-foreground">
                      Pas de synthèse disponible pour cet article. Voyez l’onglet{" "}
                      <strong className="font-medium text-foreground">Corps</strong>{" "}
                      ou <strong className="font-medium text-foreground">Source</strong>.
                    </p>
                  ) : null}

                  {a.key_quotes_fr && a.key_quotes_fr.length > 0 ? (
                    <section>
                      <p className="olj-rubric mb-2">Citations</p>
                      <ul className="space-y-2 rounded-md bg-muted/15 p-3">
                        {a.key_quotes_fr.map((quote, i) => (
                          <li
                            key={i}
                            className="font-[family-name:var(--font-serif)] text-[13px] italic text-foreground-subtle whitespace-pre-wrap"
                          >
                            «&nbsp;{formatQuoteForDisplay(quote)}&nbsp;»
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {(a.framing_actor ||
                    a.framing_tone ||
                    a.framing_prescription) && (
                    <section className="border-t border-border-light pt-4 text-[12px] text-foreground-body">
                      <p className="olj-rubric mb-2">Cadrage éditorial</p>
                      {a.framing_actor ? (
                        <p>
                          <span className="text-muted-foreground">Angle : </span>
                          {a.framing_actor}
                        </p>
                      ) : null}
                      {a.framing_tone ? (
                        <p>
                          <span className="text-muted-foreground">Registre : </span>
                          {a.framing_tone}
                        </p>
                      ) : null}
                      {a.framing_prescription ? (
                        <p>
                          <span className="text-muted-foreground">Proposition : </span>
                          {a.framing_prescription}
                        </p>
                      ) : null}
                    </section>
                  )}

                  {a.editorial_angle?.trim() ? (
                    <p className="border-t border-border-light pt-4 text-[12px] text-foreground-subtle">
                      {a.editorial_angle.trim()}
                    </p>
                  ) : null}
                </>
              ) : tab === "body" ? (
                <section className="space-y-2">
                  <p className="olj-rubric mb-1">Traduction intégrale</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Corps traduit (distinct de la synthèse éditoriale).
                  </p>
                  {hasBodyFr ? (
                    <div className="rounded-md border border-border-light bg-surface-warm/20 p-4 font-[family-name:var(--font-serif)] text-[15px] leading-[1.85] text-foreground-body">
                      {editorialBodySections(
                        sanitizeTranslatedBodyForDisplay(a.content_translated_fr!.trim()),
                      ).map(
                        (sec, si) => (
                          <div
                            key={si}
                            className={
                              si > 0
                                ? "mt-8 border-t border-border-light pt-8"
                                : ""
                            }
                          >
                            {sec.heading ? (
                              <p className="mb-4 font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
                                {sec.heading}
                              </p>
                            ) : null}
                            {sec.paragraphs.map((para, i) => (
                              <p
                                key={i}
                                className={
                                  i === 0 && si === 0
                                    ? "mb-5 last:mb-0 [&:first-letter]:float-left [&:first-letter]:mr-2 [&:first-letter]:font-[family-name:var(--font-serif)] [&:first-letter]:text-[3.25rem] [&:first-letter]:leading-[0.85] [&:first-letter]:text-accent"
                                    : "mb-5 last:mb-0"
                                }
                              >
                                {para}
                              </p>
                            ))}
                          </div>
                        ),
                      )}
                    </div>
                  ) : summaryOnly ? (
                    <p className="text-[13px] text-muted-foreground">
                      Pour cet article, la chaîne n’a pas persisté le corps
                      traduit (résumé seulement). Utilisez l’onglet{" "}
                      <strong className="font-medium text-foreground">
                        Synthèse
                      </strong>{" "}
                      ou la <strong className="font-medium text-foreground">Source</strong>.
                    </p>
                  ) : hasOriginalBody ? (
                    <>
                      <p className="text-[13px] leading-relaxed text-muted-foreground">
                        Le corps traduit complet sera disponible après la prochaine traduction
                        avec persistance du français. Texte source tel qu’ingéré (langue d’origine)
                        :
                      </p>
                      <div className="rounded-md border border-border-light bg-muted/20 p-4 font-[family-name:var(--font-serif)] text-[14px] leading-[1.75] text-foreground-body">
                        {bodyParagraphs(a.content_original!.trim()).map((para, i) => (
                          <p key={i} className="mb-3 last:mb-0">
                            {para}
                          </p>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      Aucun corps disponible en base pour cet article. Ouvrez la source ou
                      vérifiez la collecte.
                    </p>
                  )}
                </section>
              ) : (
                <section className="space-y-3 text-[13px] leading-relaxed text-foreground-body">
                  <p className="olj-rubric">Source originale</p>
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="olj-link-action inline-block break-all"
                    >
                      {a.url}
                    </a>
                  ) : (
                    <p className="text-muted-foreground">URL non renseignée.</p>
                  )}
                  <p className="text-[12px] text-muted-foreground">
                    <span className="font-medium text-foreground">Titre d’origine : </span>
                    {titleOriginalDisplay}
                  </p>
                </section>
              )}
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
