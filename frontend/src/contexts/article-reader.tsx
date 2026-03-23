"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { articleTypeLabelFr, sourceLanguageLabelFr } from "@/lib/article-labels-fr";
import { api } from "@/lib/api";
import type { Article } from "@/lib/types";

type ArticleReaderContextValue = {
  openArticle: (articleId: string) => void;
};

const ArticleReaderContext = createContext<ArticleReaderContextValue | null>(null);

export function ArticleReaderProvider({ children }: { children: ReactNode }) {
  const [articleId, setArticleId] = useState<string | null>(null);
  const openArticle = useCallback((id: string) => {
    setArticleId(id);
  }, []);
  const close = useCallback(() => setArticleId(null), []);

  return (
    <ArticleReaderContext.Provider value={{ openArticle }}>
      {children}
      {articleId ? <ArticleReadModal articleId={articleId} onClose={close} /> : null}
    </ArticleReaderContext.Provider>
  );
}

/** Ouvre la fiche article standardisée ; no-op si hors provider. */
export function useArticleReader(): (articleId: string) => void {
  const ctx = useContext(ArticleReaderContext);
  return ctx?.openArticle ?? (() => {});
}

function ArticleReadModal({
  articleId,
  onClose,
}: {
  articleId: string;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["article", articleId] as const,
    queryFn: () => api.articleById(articleId),
    enabled: Boolean(articleId),
    staleTime: 60_000,
  });

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
            <p className="text-[13px] text-muted-foreground" role="status">
              Chargement…
            </p>
          ) : q.isError ? (
            <p className="text-[13px] text-destructive" role="alert">
              {q.error instanceof Error ? q.error.message : "Impossible de charger l’article."}
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
                {a.title_fr && a.title_original && a.title_fr !== a.title_original ? (
                  <p className="text-[12px] text-muted-foreground">Titre d’origine : {a.title_original}</p>
                ) : null}
                <p className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground">{a.media_name}</span>
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
                  <p className="whitespace-pre-wrap text-foreground-body">{a.summary_fr.trim()}</p>
                </section>
              ) : null}

              {a.content_translated_fr?.trim() ? (
                <section>
                  <p className="olj-rubric mb-2">Texte</p>
                  <div className="whitespace-pre-wrap text-foreground-body">{a.content_translated_fr.trim()}</div>
                </section>
              ) : !a.summary_fr?.trim() && !a.thesis_summary_fr?.trim() ? (
                <p className="text-muted-foreground">
                  Aucun texte traduit stocké pour cet article. Utilisez le lien vers la source.
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

              {(a.framing_actor || a.framing_tone || a.framing_prescription) && (
                <section className="border-t border-border-light pt-4 text-[12px] text-muted-foreground">
                  <p className="olj-rubric mb-2">Cadrage</p>
                  {a.framing_actor ? <p>Acteur : {a.framing_actor}</p> : null}
                  {a.framing_tone ? <p>Ton : {a.framing_tone}</p> : null}
                  {a.framing_prescription ? <p>Prescription : {a.framing_prescription}</p> : null}
                </section>
              )}

              {a.editorial_angle?.trim() ? (
                <p className="border-t border-border-light pt-4 text-[12px] text-foreground-subtle">
                  {a.editorial_angle.trim()}
                </p>
              ) : null}
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
