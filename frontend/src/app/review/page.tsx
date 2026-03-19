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
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Génération
          </p>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight">
            Revue de presse
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Sélectionner, générer et exporter au format OLJ
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="border-b border-transparent px-0 pb-0.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            Historique ({history.length})
          </button>
        )}
      </header>

      {showHistory && (
        <section className="border-t border-border-light pt-6">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Revues précédentes
          </p>
          <div className="space-y-0">
            {history.map((r) => (
            <button
              key={r.id}
              onClick={() => loadHistoryItem(r)}
              className="flex w-full items-baseline justify-between border-b border-border-light py-2.5 text-left text-[13px] transition-colors hover:text-foreground"
            >
              <span className="font-medium">
                {r.title || r.review_date}
              </span>
              <span className="text-[12px] tabular-nums text-muted-foreground">
                {r.article_count} article{r.article_count > 1 ? "s" : ""}
              </span>
            </button>
          ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Articles sélectionnés — {articles.length}
        </h2>
        <SelectedArticles articles={articles} onRemove={removeArticle} />
      </section>

      {articles.length > 0 && (
        <button
          onClick={generate}
          disabled={generating || articles.length === 0}
          className="border border-foreground bg-foreground px-6 py-3 text-[14px] font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
        >
          {generating ? "Génération en cours…" : "Générer la revue de presse →"}
        </button>
      )}

      {error && (
        <p className="border-l-2 border-accent pl-4 text-[13px] text-accent">
          {error}
        </p>
      )}

      {reviewText && (
        <section>
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Résultat
          </h2>
          <ReviewPreview text={reviewText} />
        </section>
      )}
    </div>
  );
}
