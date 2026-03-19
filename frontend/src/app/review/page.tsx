"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ReviewSummary } from "@/lib/types";
import { SelectedArticles } from "@/components/review/selected-articles";
import { ReviewPreview } from "@/components/review/review-preview";

export default function ReviewPage() {
  const queryClient = useQueryClient();
  const [articleIds, setArticleIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [reviewText, setReviewText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("review_article_ids");
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
    sessionStorage.setItem("review_article_ids", JSON.stringify(next));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setReviewText(null);
    try {
      const result = await api.generateReview(articleIds);
      setReviewText(result.full_text);
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
            : `${articles.length} article${articles.length > 1 ? "s" : ""}`}
        </h2>
        <SelectedArticles articles={articles} onRemove={removeArticle} />
      </section>

      {articles.length > 0 && (
        <button
          onClick={() => void generate()}
          disabled={generating}
          className="bg-[#c8102e] px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-[#a50d25] disabled:opacity-40"
        >
          {generating ? "Génération en cours…" : "Générer la revue →"}
        </button>
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
