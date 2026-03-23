"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";
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

type ReaderTab = "synthesis" | "translation";

function ArticleReadModal({
  articleId,
  onClose,
}: {
  articleId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ReaderTab>("synthesis");
  const q = useQuery({
    queryKey: articleDetailQueryKey(articleId),
    queryFn: () => api.articleById(articleId),
    enabled: Boolean(articleId),
    staleTime: ARTICLE_QUERY_STALE_MS,
  });

  useEffect(() => {
    setTab("synthesis");
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
  const title = a?.title_fr || a?.title_original || "Article";
  const typeFr = articleTypeLabelFr(a?.article_type);
  const langFr = sourceLanguageLabelFr(a?.source_language);
  const hasBodyFr = Boolean(a?.content_translated_fr?.trim());
  const summaryOnly =
    Boolean(a?.en_translation_summary_only) && !hasBodyFr;

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
            <p className="text-[13px] text-destructive" role="alert">
              {q.error instanceof Error
                ? q.error.message
                : "Impossible de charger l’article."}
            </p>
          ) : a ? (
            <article className="space-y-4 text-[13px] leading-relaxed text-foreground-body">
              <header className="space-y-2 border-b border-border-light pb-4">
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
                    Titre d’origine : {a.title_original}
                  </p>
                ) : null}
                <p className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {a.media_name}
                  </span>
                  <span>·</span>
                  <span>{a.country}</span>
                  {typeFr ? (
                    <>
                      <span>·</span>
                      <span>{typeFr}</span>
                    </>
                  ) : null}
                  {langFr ? (
                    <>
                      <span>·</span>
                      <span>{langFr}</span>
                    </>
                  ) : null}
                  {a.author?.trim() ? (
                    <>
                      <span>·</span>
                      <span>{a.author.trim()}</span>
                    </>
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
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "synthesis"}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors",
                    tab === "synthesis"
                      ? "bg-[#c8102e]/12 text-[#c8102e]"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  onClick={() => setTab("synthesis")}
                >
                  Synthèse revue
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "translation"}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-colors",
                    tab === "translation"
                      ? "bg-[#c8102e]/12 text-[#c8102e]"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  onClick={() => setTab("translation")}
                >
                  Traduction du corps
                </button>
              </div>

              {tab === "synthesis" ? (
                <>
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
                      <p className="whitespace-pre-wrap text-foreground-body">
                        {a.summary_fr.trim()}
                      </p>
                    </section>
                  ) : null}

                  {!a.thesis_summary_fr?.trim() && !a.summary_fr?.trim() ? (
                    <p className="text-muted-foreground">
                      Pas de synthèse LLM pour cet article. Voyez l’onglet{" "}
                      <strong className="font-medium text-foreground">
                        Traduction du corps
                      </strong>{" "}
                      ou la source.
                    </p>
                  ) : null}

                  {a.key_quotes_fr && a.key_quotes_fr.length > 0 ? (
                    <section>
                      <p className="olj-rubric mb-2">Citations</p>
                      <ul className="list-inside list-disc space-y-2 text-foreground-body">
                        {a.key_quotes_fr.map((quote, i) => (
                          <li key={i} className="whitespace-pre-wrap">
                            « {quote} »
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {(a.framing_actor ||
                    a.framing_tone ||
                    a.framing_prescription) && (
                    <section className="border-t border-border-light pt-4 text-[12px] text-muted-foreground">
                      <p className="olj-rubric mb-2">Cadrage</p>
                      {a.framing_actor ? (
                        <p>Acteur : {a.framing_actor}</p>
                      ) : null}
                      {a.framing_tone ? <p>Ton : {a.framing_tone}</p> : null}
                      {a.framing_prescription ? (
                        <p>Prescription : {a.framing_prescription}</p>
                      ) : null}
                    </section>
                  )}

                  {a.editorial_angle?.trim() ? (
                    <p className="border-t border-border-light pt-4 text-[12px] text-foreground-subtle">
                      {a.editorial_angle.trim()}
                    </p>
                  ) : null}
                </>
              ) : (
                <section className="space-y-2">
                  <p className="olj-rubric mb-1">Texte traduit (pipeline)</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Version française du corps issu de la traduction automatique
                    (hors reformulation « thèse / résumé » de l’onglet précédent).
                  </p>
                  {hasBodyFr ? (
                    <div className="whitespace-pre-wrap rounded-md border border-border-light bg-surface-warm/20 p-3 text-[13px] text-foreground-body">
                      {a.content_translated_fr!.trim()}
                    </div>
                  ) : summaryOnly ? (
                    <p className="text-[13px] text-muted-foreground">
                      Pour cet article, la chaîne n’a pas persisté le corps
                      traduit (résumé seulement). Utilisez la{" "}
                      <strong className="font-medium text-foreground">
                        Synthèse revue
                      </strong>{" "}
                      ou le lien vers la source.
                    </p>
                  ) : (
                    <p className="text-[13px] text-muted-foreground">
                      Aucun corps traduit en base pour cet article. Ouvrez la
                      source ou vérifiez les options de traduction côté serveur.
                    </p>
                  )}
                </section>
              )}
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
