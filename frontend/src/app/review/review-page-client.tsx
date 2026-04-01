"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Article, ReviewSummary } from "@/lib/types";
import { parseArticleIdsParam, reviewPagePath } from "@/lib/review-url";
import { todayBeirutIsoDate } from "@/lib/beirut-date";
import { SelectedArticles } from "@/components/review/selected-articles";
import { ReviewPreview } from "@/components/review/review-preview";
import Link from "next/link";

export function ReviewPageClient() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [articleIds, setArticleIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [reviewText, setReviewText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fromUrl = parseArticleIdsParam(searchParams.get("ids"));
    setArticleIds(fromUrl);
  }, [searchParams]);

  const syncUrl = useCallback((ids: string[]) => {
    router.replace(reviewPagePath(ids), { scroll: false });
  }, [router]);

  const idsKey = articleIds.slice().sort().join(",");

  const { data: articlesData, isPending: articlesLoading } = useQuery({
    queryKey: ["articlesByIds", idsKey],
    queryFn: () => api.articlesByIds(articleIds),
    enabled: articleIds.length > 0,
  });

  const articlesOrdered = useMemo(() => {
    const list = articlesData?.articles;
    if (!list?.length) return [];
    const m = new Map(list.map((a) => [a.id, a]));
    return articleIds
      .map((id) => m.get(id))
      .filter((x): x is Article => Boolean(x));
  }, [articleIds, articlesData?.articles]);

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
    setArticleIds((prev) => {
      const next = prev.filter((i) => i !== id);
      queueMicrotask(() => syncUrl(next));
      return next;
    });
  }

  function reorderSelection(from: number, to: number) {
    if (from === to) return;
    setArticleIds((prev) => {
      const next = [...prev];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      queueMicrotask(() => syncUrl(next));
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

  const composeHref = `/edition/${todayBeirutIsoDate()}/compose`;

  return (
    <div className="space-y-8">
      <aside
        className="border border-border bg-muted/40 px-4 py-3 text-[13px] text-foreground"
        role="note"
      >
        <strong className="font-semibold">Ce flux est déprécié.</strong> Pour la rédaction
        par grands sujets (sélection, consignes, export), utilisez{" "}
        <Link href={composeHref} className="text-accent underline underline-offset-2">
          Rédaction · édition du jour
        </Link>
        .
      </aside>
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
            Revue de presse
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Texte prêt à copier-coller dans le CMS
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
          >
            Historique ({history.length})
          </button>
        )}
      </header>

      {showHistory && (
        <section className="border border-border">
          {history.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setReviewText(r.full_text);
                setShowHistory(false);
              }}
              className="flex w-full items-baseline justify-between border-b border-border-light px-3 py-2 text-left text-[13px] hover:bg-muted"
            >
              <span className="font-medium">{r.title || r.review_date}</span>
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {r.article_count}
                {r.created_by ? ` · ${r.created_by}` : ""}
              </span>
            </button>
          ))}
        </section>
      )}

      <section>
        <h2 className="olj-rubric olj-rule">
          Sélection ·{" "}
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
            className="bg-accent px-6 py-2.5 text-[13px] font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-40"
          >
            {generating ? "Génération en cours…" : "Générer la revue →"}
          </button>
          {generating && (
            <div className="max-w-md space-y-1">
              <div className="h-1 w-full overflow-hidden bg-border-light">
                <div
                  className="h-full bg-foreground transition-[width] duration-300"
                  style={{ width: `${genProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Estimation indicative : environ {Math.max(1, articleIds.length)} × 15 s
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="border-l-2 border-destructive pl-3 text-[13px] text-destructive">
          {error}
        </p>
      )}

      {reviewText && (
        <section>
          <h2 className="olj-rubric olj-rule">Texte généré</h2>
          <ReviewPreview text={reviewText} />
        </section>
      )}
    </div>
  );
}
