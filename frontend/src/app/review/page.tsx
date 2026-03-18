"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ReviewSummary } from "@/lib/types";
import { SelectedArticles } from "@/components/review/selected-articles";
import { ReviewPreview } from "@/components/review/review-preview";
import { Loader2, Sparkles, History } from "lucide-react";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Revue de presse
          </h1>
          <p className="text-muted-foreground">
            Générer et exporter la revue au format OLJ
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
          >
            <History className="h-4 w-4" />
            Historique ({history.length})
          </button>
        )}
      </div>

      {showHistory && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Revues précédentes</h3>
          <div className="space-y-2">
            {history.map((r) => (
              <button
                key={r.id}
                onClick={() => loadHistoryItem(r)}
                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{r.title || r.review_date}</span>
                <span className="text-xs text-muted-foreground">
                  {r.article_count} articles
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Articles sélectionnés ({articles.length})
        </h2>
        <SelectedArticles
          articles={articles}
          onRemove={removeArticle}
        />
      </div>

      {articles.length > 0 && (
        <button
          onClick={generate}
          disabled={generating || articles.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Génération en cours
              (Claude Sonnet 4.5)...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Générer la revue de presse
            </>
          )}
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {reviewText && <ReviewPreview text={reviewText} />}
    </div>
  );
}
