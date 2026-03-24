"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayClusterTitle } from "@/lib/cluster-display";
import type { ClusterArticlesResponse } from "@/lib/types";
import { saveReviewArticleIds } from "@/lib/review-selection-storage";
import { useReviewArticleSelection } from "@/hooks/use-review-article-selection";

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { selectedIds, toggleArticle, clearSelection, ready } =
    useReviewArticleSelection(id);

  const { data, isPending, error: queryError } = useQuery({
    queryKey: ["clusterArticles", id],
    queryFn: (): Promise<ClusterArticlesResponse> => api.clusterArticles(id),
    enabled: Boolean(id),
  });

  const error = queryError instanceof Error ? queryError.message : null;
  const loading = isPending;

  function goToReview() {
    saveReviewArticleIds(selectedIds);
    router.push("/review");
  }

  const clusterLabel = data?.cluster_label ?? "Sujet";

  const matrixRows = useMemo(() => {
    if (!data) return [];
    return data.countries.map((country) => {
      const arts = data.articles_by_country[country] ?? [];
      const top = arts[0];
      return {
        country,
        thesis: top?.thesis_summary_fr ?? null,
        media: top?.source_name ?? null,
        type: top?.article_type ?? null,
      };
    });
  }, [data]);

  const ledeThesis = useMemo(() => {
    const t = matrixRows.map((r) => r.thesis).find((x) => x && x.trim());
    return t?.trim() ?? null;
  }, [matrixRows]);

  const ledeSummaryExcerpt = useMemo(() => {
    if (!data) return null;
    for (const country of data.countries) {
      const arts = data.articles_by_country[country] ?? [];
      const s = arts[0]?.summary_fr?.trim();
      if (s) return s;
    }
    return null;
  }, [data]);

  return (
    <div className="space-y-8 pb-24">
      <header>
        <Link
          href="/dashboard"
          className="mb-4 inline-block text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Clusters & vigie
        </Link>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          {loading ? "Chargement…" : displayClusterTitle(clusterLabel)}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {data
            ? `${data.total_articles} articles · ${data.countries.length} pays`
            : ""}
        </p>
        {!loading && ledeThesis ? (
          <div className="mt-6 border-l-2 border-accent/30 pl-4">
            <p className="font-[family-name:var(--font-serif)] text-[1.15rem] font-semibold leading-snug text-foreground sm:text-[1.25rem]">
              {ledeThesis}
            </p>
            {ledeSummaryExcerpt ? (
              <p
                className="mt-3 text-[13px] leading-relaxed text-foreground-body line-clamp-3"
                title={ledeSummaryExcerpt}
              >
                {ledeSummaryExcerpt}
              </p>
            ) : null}
          </div>
        ) : !loading && ledeSummaryExcerpt ? (
          <p
            className="mt-6 max-w-3xl border-l-2 border-accent/30 pl-4 text-[13px] leading-relaxed text-foreground-body line-clamp-3"
            title={ledeSummaryExcerpt}
          >
            {ledeSummaryExcerpt}
          </p>
        ) : null}
      </header>

      {error && (
        <p className="border-l-2 border-destructive pl-3 text-[13px] text-destructive">
          {error}
        </p>
      )}

      {matrixRows.length > 0 && (
        <section className="border border-border-light">
          <h2 className="border-b border-border-light px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Matrice pays (aperçu)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-[12px]">
              <thead>
                <tr className="border-b border-border-light text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Pays</th>
                  <th className="px-3 py-2 font-medium">Thèse</th>
                  <th className="px-3 py-2 font-medium">Média</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => (
                  <tr key={row.country} className="border-b border-border-light">
                    <td className="px-3 py-2 align-top text-foreground">
                      {row.country}
                    </td>
                    <td className="px-3 py-2 align-top font-[family-name:var(--font-serif)] italic text-foreground">
                      {row.thesis ? `« ${row.thesis} »` : "n.d."}
                    </td>
                    <td className="px-3 py-2 align-top text-foreground-body">
                      {row.media ?? "n.d."}
                    </td>
                    <td className="px-3 py-2 align-top text-muted-foreground">
                      {row.type ?? "n.d."}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data &&
        data.countries.map((country) => {
          const articles = data.articles_by_country[country] ?? [];
          return (
            <section key={country}>
              <h2 className="mb-2 border-b border-border pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {country}
              </h2>
              <ul className="space-y-4">
                {articles.map((a) => (
                  <li key={a.id} className="flex gap-4">
                    <label className="flex shrink-0 items-start pt-0.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.id)}
                        onChange={() => {
                          toggleArticle(a.id);
                        }}
                        className="h-4 w-4 border-border"
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      {a.thesis_summary_fr && (
                        <p className="mb-1 font-[family-name:var(--font-serif)] text-[14px] font-medium italic text-foreground">
                          «&nbsp;{a.thesis_summary_fr}&nbsp;»
                        </p>
                      )}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-[family-name:var(--font-serif)] text-[15px] font-medium text-foreground hover:underline"
                      >
                        {a.title_fr || a.title_original}
                      </a>
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {a.source_name ?? ""}
                        {a.published_at
                          ? ` · ${new Date(a.published_at).toLocaleDateString("fr-FR")}`
                          : ""}
                        {a.article_type ? ` · ${a.article_type}` : ""}
                        {a.cluster_soft_assigned ? " · rattaché au sujet" : ""}
                      </p>
                      {a.framing_line && (
                        <p className="mt-1 text-[12px] text-foreground-body">{a.framing_line}</p>
                      )}
                      {a.summary_fr && (
                        <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-foreground-body">
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

      {ready && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background px-5 py-4 sm:px-6">
          <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-foreground-body">
                {selectedIds.size} article{selectedIds.size > 1 ? "s" : ""} sélectionné
                {selectedIds.size > 1 ? "s" : ""}
                <span className="ml-1 text-[11px] text-muted-foreground/80">
                  (plusieurs clusters possibles)
                </span>
              </span>
              <button
                type="button"
                onClick={() => clearSelection()}
                className="text-[11px] text-muted-foreground underline hover:text-foreground"
              >
                Tout effacer
              </button>
            </div>
            <button
              type="button"
              onClick={goToReview}
              className="shrink-0 bg-accent px-6 py-2.5 text-[13px] font-semibold text-accent-foreground hover:opacity-90"
            >
              Générer la revue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
