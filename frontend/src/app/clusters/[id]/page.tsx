"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ClusterArticle, ClusterArticlesResponse } from "@/lib/types";

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<ClusterArticlesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.clusterArticles(id);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleArticle(articleId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }

  function goToReview() {
    const ids = Array.from(selectedIds);
    sessionStorage.setItem("review_article_ids", JSON.stringify(ids));
    router.push("/review");
  }

  const allArticles: ClusterArticle[] = data
    ? Object.values(data.articles_by_country).flat()
    : [];

  const clusterLabel = data?.cluster_label ?? "Cluster";

  return (
    <div className="space-y-8 pb-24">
      <header>
        <Link
          href="/"
          className="mb-4 inline-block text-[12px] text-[#888] hover:text-[#1a1a1a]"
        >
          ← Sujets du jour
        </Link>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          {loading ? "Chargement…" : clusterLabel}
        </h1>
        <p className="mt-1 text-[13px] text-[#888]">
          {data ? `${data.total_articles} articles · ${data.countries.length} pays` : ""}
        </p>
      </header>

      {error && (
        <p className="border-l-2 border-[#c8102e] pl-3 text-[13px] text-[#c8102e]">
          {error}
        </p>
      )}

      {data &&
        data.countries.map((country) => {
          const articles = data.articles_by_country[country] ?? [];
          return (
            <section key={country}>
              <h2 className="mb-2 border-b border-[#dddcda] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888]">
                {country}
              </h2>
              <ul className="space-y-4">
                {articles.map((a) => (
                  <li key={a.id} className="flex gap-4">
                    <label className="flex shrink-0 items-start pt-0.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleArticle(a.id)}
                        className="h-4 w-4 border-[#dddcda]"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-[family-name:var(--font-serif)] text-[15px] font-medium text-[#1a1a1a] hover:underline"
                      >
                        {a.title_fr || a.title_original}
                      </a>
                      <p className="mt-0.5 text-[12px] text-[#888]">
                        {a.source_name ?? ""}
                        {a.published_at
                          ? ` · ${new Date(a.published_at).toLocaleDateString("fr-FR")}`
                          : ""}
                        {a.article_type ? ` · ${a.article_type}` : ""}
                      </p>
                      {a.summary_fr && (
                        <p className="mt-1 line-clamp-2 text-[13px] text-[#666]">
                          {a.summary_fr}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-[#dddcda] bg-white px-5 py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <span className="text-[13px] text-[#666]">
              {selectedIds.size} article{selectedIds.size > 1 ? "s" : ""} sélectionné
              {selectedIds.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={goToReview}
              className="bg-[#c8102e] px-6 py-2.5 text-[13px] font-semibold text-white hover:bg-[#a50d25]"
            >
              Générer la revue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
