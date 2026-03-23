"use client";

import Link from "next/link";
import { useMemo } from "react";
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
  const title = article.title.trim() || "Sans titre";
  return (
    <div className="border-b border-border-light py-2.5 text-[12px] last:border-b-0">
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
      </div>
    </div>
  );
}

/**
 * Regroupements sémantiques (HDBSCAN) pour l’édition : complément aux grands sujets LLM.
 */
export function EditionThemesView({
  rows,
  selectedIds,
  onToggleArticle,
  isLoading,
  countryLabelsFr,
}: {
  rows: ClusterFallbackRow[];
  selectedIds: ReadonlySet<string>;
  onToggleArticle: (id: string, next: boolean) => void;
  isLoading?: boolean;
  countryLabelsFr?: Record<string, string> | null;
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
        Chargement des regroupements thématiques…
      </p>
    );
  }

  if (sortedRows.length === 0) {
    return (
      <div className="max-w-2xl space-y-2">
        <h2 className="olj-rubric olj-rule">Regroupements thématiques</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucun regroupement disponible pour cette édition. Il faut au moins
          deux textes assignés au même thème après le traitement (embeddings et
          clustering). Lancez le traitement complet depuis l’en-tête si besoin.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="olj-rubric olj-rule mb-2">Regroupements thématiques</h2>
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          Vue complémentaire aux grands sujets : classement par similarité de
          textes sur le corpus de l’édition. Les blocs couvrant plusieurs pays
          sont prioritaires pour la veille régionale.
        </p>
      </div>
      <ul className="space-y-5">
        {sortedRows.map((row) => {
          const multi = row.country_count >= 2;
          const groups = groupByCountry(row.articles);
          return (
            <li
              key={row.cluster_id}
              className={cn(
                "border border-border",
                multi ? "bg-background" : "bg-muted/15 opacity-95",
              )}
            >
              <div className="border-b border-border-light px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/clusters/${row.cluster_id}`}
                    className="font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {row.label?.trim() || "Thème sans libellé"}
                  </Link>
                  <span className="tabular-nums text-[11px] text-muted-foreground">
                    {row.article_count} texte{row.article_count > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  {multi ? (
                    <span className="border-l-2 border-accent pl-2 font-medium text-foreground">
                      Multi-perspective
                    </span>
                  ) : (
                    <span className="border-l border-border pl-2 text-muted-foreground">
                      Perspective limitée
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
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {flag ? `${flag} ${label}` : label}
                      </p>
                      <div className="rounded border border-border-light bg-surface/40">
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
