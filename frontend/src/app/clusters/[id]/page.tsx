"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { displayClusterTitle } from "@/lib/cluster-display";
import { reviewPagePath } from "@/lib/review-url";
import { countryLabelFr } from "@/lib/country-labels-fr";
import { formatPublishedAtFr } from "@/lib/dates-display-fr";
import { useArticleReader } from "@/contexts/article-reader";
import type { ClusterArticlesResponse } from "@/lib/types";

/* Article dans le détail cluster
 * Pattern produit : click titre OU bouton "Lire" → reader modal. Aucun expand inline.
 */
function ClusterArticleItem({
  a,
  selected,
  onToggle,
}: {
  a: ClusterArticlesResponse["articles_by_country"][string][number];
  selected: boolean;
  onToggle: () => void;
}) {
  const { openArticle, prefetchArticle } = useArticleReader();
  const hasBullets = a.analysis_bullets_fr && a.analysis_bullets_fr.length > 0;

  return (
    <li
      className="group flex gap-3 rounded-lg border border-border/60 bg-card px-4 py-3.5 transition-all [transition-duration:var(--duration-fast)] [transition-timing-function:var(--ease-out-expo)] hover:border-border hover:shadow-low hover:-translate-y-px"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={selected ? "Désélectionner" : "Sélectionner"}
        className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center border transition-colors"
        style={{
          borderRadius: 3,
          borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
          background:  selected ? "var(--color-accent)" : "var(--color-background)",
        }}
      >
        {selected && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* Thèse */}
        {a.thesis_summary_fr && (
          <p className="mb-1.5 font-[family-name:var(--font-serif)] text-[14px] italic leading-relaxed text-foreground-body">
            {a.thesis_summary_fr}
          </p>
        )}

        {/* Titre — reader modal */}
        <button
          type="button"
          className="text-left font-[family-name:var(--font-serif)] text-[14px] font-semibold leading-snug text-foreground transition-colors hover:text-accent [transition-duration:var(--duration-fast)]"
          onMouseEnter={() => prefetchArticle(a.id)}
          onClick={() => openArticle(a.id)}
        >
          {a.title_fr || a.title_original}
        </button>

        {/* Méta */}
        <p className="mt-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground-body">{a.source_name ?? ""}</span>
          {a.published_at ? ` · ${formatPublishedAtFr(a.published_at, "short")}` : ""}
          {a.article_type && (
            <span className="ml-1 inline-flex rounded border border-border/60 bg-muted/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              {a.article_type}
            </span>
          )}
        </p>

        {/* Bullets d'analyse */}
        {hasBullets && (
          <ol className="mt-2.5 space-y-1.5">
            {a.analysis_bullets_fr!.slice(0, 3).map((b, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-foreground-body">
                <span className="mt-[1px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-accent/8 text-[9px] font-semibold tabular-nums text-accent">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">{b}</span>
              </li>
            ))}
            {a.analysis_bullets_fr!.length > 3 && (
              <li className="pl-[24px] text-[11px] text-muted-foreground">
                +{a.analysis_bullets_fr!.length - 3} points
              </li>
            )}
          </ol>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="olj-btn-secondary px-3 py-1 text-[11px]"
            onMouseEnter={() => prefetchArticle(a.id)}
            onClick={() => openArticle(a.id)}
          >
            Lire
          </button>
          {a.url && (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="olj-link-action text-[11px]"
            >
              Source ↗
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ClusterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const toggleArticle = useCallback((articleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const { data, isPending, error: queryError } = useQuery({
    queryKey: ["clusterArticles", id],
    queryFn: (): Promise<ClusterArticlesResponse> => api.clusterArticles(id),
    enabled: Boolean(id),
  });

  const error = queryError instanceof Error ? queryError.message : null;
  const loading = isPending;

  function goToReview() {
    router.push(reviewPagePath([...selectedIds]));
  }

  const clusterLabel = data?.cluster_label ?? "Sujet";

  const matrixRows = useMemo(() => {
    if (!data) return [];
    return data.countries.map((code) => {
      const arts = data.articles_by_country[code] ?? [];
      const top = arts[0];
      return {
        code,
        countryLabel: countryLabelFr(code),
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
    for (const code of data.countries) {
      const arts = data.articles_by_country[code] ?? [];
      const s = arts[0]?.summary_fr?.trim();
      if (s) return s;
    }
    return null;
  }, [data]);

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <header className="space-y-4">
        <Link
          href="/panorama"
          className="inline-block text-[12px] text-muted-foreground hover:text-foreground"
        >
          ← Panorama
        </Link>
        <h1 className="font-[family-name:var(--font-serif)] text-[26px] font-semibold leading-tight">
          {loading ? "Chargement…" : displayClusterTitle(clusterLabel)}
        </h1>
        {data && (
          <p className="text-[13px] text-muted-foreground">
            {data.total_articles} article{data.total_articles > 1 ? "s" : ""} · {data.countries.length} pays
          </p>
        )}

        {/* Lede thèse + résumé */}
        {!loading && ledeThesis && (
          <div className="rounded-lg border border-border/50 bg-muted/10 p-5">
            <p className="font-[family-name:var(--font-serif)] text-[1.2rem] font-semibold leading-snug text-foreground">
              {ledeThesis}
            </p>
            {ledeSummaryExcerpt && (
              <p className="mt-3 text-[13px] leading-relaxed text-foreground-body">
                {ledeSummaryExcerpt}
              </p>
            )}
          </div>
        )}
        {!loading && !ledeThesis && ledeSummaryExcerpt && (
          <div className="rounded-lg border border-border/50 bg-muted/10 p-5">
            <p className="text-[13px] leading-relaxed text-foreground-body">
              {ledeSummaryExcerpt}
            </p>
          </div>
        )}
      </header>

      {error && (
        <p className="olj-alert-destructive px-3 py-2">{error}</p>
      )}

      {/* Matrice pays */}
      {matrixRows.length > 0 && (
        <section>
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Matrice pays (aperçu)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[32rem] text-left text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Pays</th>
                  <th className="px-4 py-2.5 font-medium">Thèse</th>
                  <th className="px-4 py-2.5 font-medium">Média</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row, idx) => (
                  <tr
                    key={row.code}
                    className={`border-b border-border/50 ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <td className="px-4 py-2.5 align-top font-medium text-foreground">
                      {row.countryLabel}
                    </td>
                    <td className="px-4 py-2.5 align-top font-[family-name:var(--font-serif)] italic text-foreground">
                      {row.thesis ? `« ${row.thesis} »` : "—"}
                    </td>
                    <td className="px-4 py-2.5 align-top text-foreground-body">
                      {row.media ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 align-top text-muted-foreground">
                      {row.type ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Articles par pays — avec barre latérale accent */}
      {data &&
        data.countries.map((code) => {
          const articles = data.articles_by_country[code] ?? [];
          const heading = articles[0]?.country?.trim() || countryLabelFr(code);
          return (
            <section key={code}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground">
                  {heading}
                </h2>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {articles.length} texte{articles.length > 1 ? "s" : ""}
                </span>
              </div>
              <ul className="space-y-3">
                {articles.map((a) => (
                  <ClusterArticleItem
                    key={a.id}
                    a={a}
                    selected={selectedIds.has(a.id)}
                    onToggle={() => toggleArticle(a.id)}
                  />
                ))}
              </ul>
            </section>
          );
        })}

      {/* Barre sticky sélection */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-border bg-background/95 px-5 py-4 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex max-w-[960px] items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-foreground-body">
                {selectedIds.size} article{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="olj-link-action text-[11px] text-muted-foreground"
              >
                Tout effacer
              </button>
            </div>
            <button
              type="button"
              onClick={goToReview}
              className="olj-btn-primary rounded-lg px-6 py-2.5 text-[13px]"
            >
              Générer la revue →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
