"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useArticleReader } from "@/contexts/article-reader";
import { clusterFallbackDisplayTitle } from "@/lib/cluster-display";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import type { ClusterFallbackArticle, ClusterFallbackRow } from "@/lib/types";
import { cn } from "@/lib/utils";

function groupByCountry(
  articles: ClusterFallbackArticle[],
): [string, ClusterFallbackArticle[]][] {
  const m = new Map<string, ClusterFallbackArticle[]>();
  for (const a of articles) {
    const code = (a.country_code ?? "").trim().toUpperCase();
    const key = code || (a.country ?? "").trim() || "—";
    const list = m.get(key) ?? [];
    list.push(a);
    m.set(key, list);
  }
  return [...m.entries()].sort(([ka], [kb]) => ka.localeCompare(kb, "fr"));
}

function countryHeaderLabel(
  key: string,
  articles: ClusterFallbackArticle[],
  countryLabelsFr: Record<string, string> | null | undefined,
): string {
  const first = articles[0];
  const code = (first?.country_code ?? "").trim().toUpperCase();
  if (code && countryLabelsFr?.[code]) {
    return countryLabelsFr[code];
  }
  const name = (first?.country ?? "").trim();
  if (name) return name;
  if (key === "—") return "Pays non renseigné";
  return key;
}

function ThemeArticleRow({
  article,
  selected,
  onToggle,
}: {
  article: ClusterFallbackArticle;
  selected: boolean;
  onToggle: (next: boolean) => void;
}) {
  const openArticle = useArticleReader();
  const title = article.title.trim() || "Sans titre";
  return (
    <div className="px-3 py-3 text-[12px] sm:px-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="olj-focus mt-1 size-[15px] shrink-0 border-border"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Inclure ${title}`}
        />
        <div className="min-w-0 flex-1">
          <span className="text-muted-foreground">{article.source}</span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium leading-snug text-foreground">{title}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            className="olj-btn-secondary px-2 py-0.5 text-[10px]"
            onClick={() => openArticle(article.id)}
          >
            Lire
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Affinités : familles de textes rapprochés par similarité (HDBSCAN), distinctes du sommaire LLM.
 */
export function EditionThemesView({
  rows,
  selectedIds,
  onToggleArticle,
  isLoading,
  countryLabelsFr,
  /** Masque l’en-tête interne : le parent affiche déjà « Affinités / Textes très proches ». */
  embedded = false,
}: {
  rows: ClusterFallbackRow[];
  selectedIds: ReadonlySet<string>;
  onToggleArticle: (id: string, next: boolean) => void;
  isLoading?: boolean;
  countryLabelsFr?: Record<string, string> | null;
  embedded?: boolean;
}) {
  const sortedRows = useMemo(() => {
    const r = [...rows];
    r.sort((a, b) => {
      const ma = a.country_count >= 2 ? 0 : 1;
      const mb = b.country_count >= 2 ? 0 : 1;
      if (ma !== mb) return ma - mb;
      if (b.article_count !== a.article_count) {
        return b.article_count - a.article_count;
      }
      return b.country_count - a.country_count;
    });
    return r;
  }, [rows]);

  if (isLoading) {
    return (
      <p className="text-[12px] text-muted-foreground">
        Chargement des affinités…
      </p>
    );
  }

  if (sortedRows.length === 0) {
    if (embedded) {
      return null;
    }
    return (
      <div className="max-w-2xl space-y-2">
        <h2 className="olj-rubric olj-rule">Affinités</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucune famille de textes très proches pour cette édition. Lancez le traitement complet si besoin.
        </p>
      </div>
    );
  }

  return (
    <section className={embedded ? "space-y-5" : "space-y-6"}>
      {!embedded ? (
        <div>
          <h2 className="olj-rubric olj-rule mb-2">Regroupements thématiques</h2>
          <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
            Regroupement par similarité (HDBSCAN). Les blocs multi-pays sont
            mis en avant.
          </p>
        </div>
      ) : null}
      <ul className="space-y-5">
        {sortedRows.map((row) => {
          const multi = row.country_count >= 2;
          const groups = groupByCountry(row.articles);
          return (
            <li
              key={row.cluster_id}
              className={cn(
                "overflow-hidden rounded-lg border border-border bg-card",
                multi && "ring-1 ring-[#c8102e]/15",
              )}
            >
              <div className="border-b border-border-light bg-background/80 px-4 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/clusters/${row.cluster_id}`}
                    className="font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {clusterFallbackDisplayTitle(row)}
                  </Link>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {row.article_count} texte{row.article_count > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  {multi ? (
                    <span className="inline-flex rounded-md border border-border bg-background px-2 py-0.5 font-medium text-foreground-body">
                      Plusieurs pays
                    </span>
                  ) : (
                    <span className="inline-flex rounded-md border border-border bg-muted/20 px-2 py-0.5 font-medium text-muted-foreground">
                      Un seul pays
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {row.source_count} source{row.source_count > 1 ? "s" : ""},{" "}
                    {row.country_count} pays
                  </span>
                  {row.countries.length > 0 ? (
                    <span className="text-foreground-body" aria-hidden>
                      {row.countries
                        .map((c) => REGION_FLAG_EMOJI[c])
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="px-4 py-2">
                {groups.map(([key, arts]) => {
                  const cc = (arts[0]?.country_code ?? "").trim().toUpperCase();
                  const flag = cc ? REGION_FLAG_EMOJI[cc] : null;
                  const label = countryHeaderLabel(key, arts, countryLabelsFr);
                  return (
                    <div key={key} className="mb-4 last:mb-0">
                      <p className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">
                        {flag ? (
                          <span className="text-[13px] leading-none" aria-hidden>
                            {flag}
                          </span>
                        ) : null}
                        {label}
                      </p>
                      <div className="divide-y divide-border-light rounded-md border border-border-light bg-card">
                        {arts.map((a) => (
                          <ThemeArticleRow
                            key={a.id}
                            article={a}
                            selected={selectedIds.has(a.id)}
                            onToggle={(next) => onToggleArticle(a.id, next)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
