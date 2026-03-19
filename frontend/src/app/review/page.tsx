"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ReviewSummary } from "@/lib/types";
import { SelectedArticles } from "@/components/review/selected-articles";
import { ReviewPreview } from "@/components/review/review-preview";

export default function ReviewPage() {
  const [articleIds, setArticleIds] = useState<string[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [generating, setGenerating] = useState(false);
  const [reviewText, setReviewText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ReviewSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("review_article_ids");
    if (stored) {
      try {
        const ids = JSON.parse(stored) as string[];
        setArticleIds(ids);
      } catch {
        /* ignore */
      }
    }
    api.reviews().then((r) => setHistory(r.reviews)).catch(() => {});
  }, []);

  const loadArticles = useCallback(async () => {
    if (articleIds.length === 0) {
      setArticles([]);
      return;
    }
    try {
      const data = await api.articles({
        status: "translated,formatted,needs_review",
        limit: "200",
      });
      const selected = data.articles.filter((a) => articleIds.includes(a.id));
      setArticles(selected);
    } catch {
      /* ignore */
    }
  }, [articleIds]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  function removeArticle(id: string) {
    const next = articleIds.filter((i) => i !== id);
    setArticleIds(next);
    sessionStorage.setItem("review_article_ids", JSON.stringify(next));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setReviewText(null);
    try {
      const result = await api.generateReview(articleIds);
      setReviewText(result.full_text);
      const h = await api.reviews();
      setHistory(h.reviews);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la génération"
      );
    } finally {
      setGenerating(false);
    }
  }

  function loadHistoryItem(item: ReviewSummary) {
    setReviewText(item.full_text);
    setShowHistory(false);
  }

  return (
    <div className="mx-auto max-w-[var(--max-width-page)] px-[var(--spacing-page)] pt-12 pb-32">
      <header className="mb-14 flex items-end justify-between gap-8">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Génération
          </p>
          <h1 className="mt-2 font-serif text-[2rem] font-semibold leading-[1.2] tracking-tight text-foreground">
            Revue de presse
          </h1>
          <p className="mt-1.5 font-mono text-[12px] text-muted-foreground">
            Sélectionner, générer et exporter au format OLJ
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Historique ({history.length})
          </button>
        )}
      </header>

      {showHistory && (
        <section className="mb-12 border-t border-border-light/60 pt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Revues précédentes
          </p>
          <div className="mt-3">
            {history.map((r) => (
              <button
                key={r.id}
                onClick={() => loadHistoryItem(r)}
                className="flex w-full items-baseline justify-between border-b border-border-light/50 py-2.5 text-left font-mono text-[12px] transition-colors hover:text-foreground"
              >
                <span className="font-medium text-foreground">{r.title || r.review_date}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.article_count} art.
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Sélection — {articles.length} article{articles.length !== 1 ? "s" : ""}
        </p>
        <SelectedArticles articles={articles} onRemove={removeArticle} />
      </section>

      {articles.length > 0 && (
        <button
          onClick={generate}
          disabled={generating || articles.length === 0}
          className="font-mono text-[11px] tracking-wider text-foreground underline decoration-accent underline-offset-2 hover:text-accent disabled:opacity-40 disabled:no-underline"
        >
          {generating ? "Génération…" : "Générer la revue →"}
        </button>
      )}

      {error && (
        <p className="mt-10 border-l-2 border-accent pl-4 font-mono text-[12px] text-accent">
          {error}
        </p>
      )}

      {reviewText && (
        <section className="mt-20">
          <ReviewPreview text={reviewText} />
        </section>
      )}
    </div>
  );
}
