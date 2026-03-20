"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ReviewSummary } from "@/lib/types";
import { REVIEW_ARTICLE_IDS_KEY } from "@/lib/review-selection-storage";
import { SelectedArticles } from "@/components/review/selected-articles";
import { ReviewPreview } from "@/components/review/review-preview";

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const [articleIds, setArticleIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [reviewText, setReviewText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(REVIEW_ARTICLE_IDS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) {
          setArticleIds(parsed.filter((x): x is string => typeof x === "string"));
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const idsKey = articleIds.slice().sort().join(",");

  const { data: articlesData, isPending: articlesLoading } = useQuery({
    queryKey: ["articlesByIds", idsKey],
    queryFn: () => api.articlesByIds(articleIds),
    enabled: articleIds.length > 0,
  });

  const articles: Article[] = articlesData?.articles ?? [];

  const articlesOrdered = useMemo(() => {
    const m = new Map(articles.map((a) => [a.id, a]));
    return articleIds
      .map((id) => m.get(id))
      .filter((x): x is Article => Boolean(x));
  }, [articleIds, articles]);

  useEffect(() => {
    if (!generating) {
      setGenProgress(0);
      return;
    }
    const n = Math.max(1, articleIds.length);
    const est = Math.min(120_000, 6_000 + n * 14_000);
    const t0 = Date.now();
    const id = window.setInterval(() => {
      setGenProgress(Math.min(95, ((Date.now() - t0) / est) * 100));
    }, 320);
    return () => clearInterval(id);
  }, [generating, articleIds.length]);

  const { data: reviewsData } = useQuery({
    queryKey: ["reviews"] as const,
    queryFn: () => api.reviews(),
  });

  const history: ReviewSummary[] = reviewsData?.reviews ?? [];

  const refreshReviews = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["reviews"] });
  }, [queryClient]);

  function removeArticle(id: string) {
    const next = articleIds.filter((i) => i !== id);
    setArticleIds(next);
    sessionStorage.setItem(REVIEW_ARTICLE_IDS_KEY, JSON.stringify(next));
  }

  function reorderSelection(from: number, to: number) {
    if (from === to) return;
    setArticleIds((prev) => {
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      sessionStorage.setItem(REVIEW_ARTICLE_IDS_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function generate() {
    setGenerating(true);
    setGenProgress(2);
    setError(null);
    setReviewText(null);
    try {
      const result = await api.generateReview(articleIds);
      setReviewText(result.full_text);
      setGenProgress(100);
      refreshReviews();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la génération",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
            Revue de presse
          </h1>
          <p className="mt-0.5 text-[13px] text-[#888]">
            Texte prêt à copier-coller dans le CMS
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="border border-[#dddcda] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a] hover:bg-[#f7f7f5]"
          >
            Historique ({history.length})
          </button>
        )}
      </header>

      {showHistory && (
        <section className="border border-[#dddcda]">
          {history.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setReviewText(r.full_text);
                setShowHistory(false);
              }}
              className="flex w-full items-baseline justify-between border-b border-[#eeede9] px-3 py-2 text-left text-[13px] hover:bg-[#f7f7f5]"
            >
              <span className="font-medium">{r.title || r.review_date}</span>
              <span className="tabular-nums text-[11px] text-[#888]">
                {r.article_count}
                {r.created_by ? ` · ${r.created_by}` : ""}
              </span>
            </button>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-2 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Sélection —{" "}
          {articlesLoading && articleIds.length > 0
            ? "…"
            : `${articlesOrdered.length} article${articlesOrdered.length > 1 ? "s" : ""}`}
        </h2>
        <SelectedArticles
          articles={articlesOrdered}
          onRemove={removeArticle}
          onReorder={reorderSelection}
        />
      </section>

      {articlesOrdered.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="bg-[#c8102e] px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-[#a50d25] disabled:opacity-40"
          >
            {generating ? "Génération en cours…" : "Générer la revue →"}
          </button>
          {generating && (
            <div className="max-w-md space-y-1">
              <div className="h-1 w-full overflow-hidden bg-[#eeede9]">
                <div
                  className="h-full bg-[#1a1a1a] transition-[width] duration-300"
                  style={{ width: `${genProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-[#888]">
                Estimation indicative ~{Math.max(1, articleIds.length)} × 15 s (LLM)
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="border-l-2 border-[#c8102e] pl-3 text-[13px] text-[#c8102e]">
          {error}
        </p>
      )}

      {reviewText && (
        <section>
          <h2 className="mb-3 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
            Texte généré
          </h2>
          <ReviewPreview text={reviewText} />
        </section>
      )}
    </div>
  );
}
