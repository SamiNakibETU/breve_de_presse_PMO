"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const { openArticle, prefetchArticle } = useArticleReader();
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
            onMouseEnter={() => prefetchArticle(article.id)}
            onFocus={() => prefetchArticle(article.id)}
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
 * Regroupements thématiques : textes rapprochés par similarité, distincts du sommaire éditorial.
 */
export function EditionThemesView({
  rows,
  selectedIds,
  onToggleArticle,
  isLoading,
  countryLabelsFr,
  /** Masque l’en-tête interne : le parent affiche déjà le titre de section. */
  embedded = false,
}: {
  rows: ClusterFallbackRow[];
  selectedIds: ReadonlySet<string>;
  onToggleArticle: (id: string, next: boolean) => void;
  isLoading?: boolean;
  countryLabelsFr?: Record<string, string> | null;
  embedded?: boolean;
}) {
  const [listFilter, setListFilter] = useState<"all" | "useful">("useful");

  const sortedRows = useMemo(() => {
    const r = rows.filter((row) => row.article_count >= 3);
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

  const visibleRows = useMemo(() => {
    if (listFilter === "all") {
      return sortedRows;
    }
    return sortedRows.filter(
      (row) => row.country_count >= 2 || row.source_count >= 2,
    );
  }, [sortedRows, listFilter]);

  const hiddenByFilter =
    listFilter === "useful" ? sortedRows.length - visibleRows.length : 0;

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
        <h2 className="olj-rubric olj-rule">Regroupements thématiques</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Aucun regroupement suffisant pour cette édition. Lancez une mise à jour complète si besoin.
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
            Textes rapprochés automatiquement. Les blocs couvrant plusieurs pays sont mis en avant.
          </p>
        </div>
      ) : null}
      {embedded && sortedRows.length > 0 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="shrink-0 font-medium text-foreground-body">
              Filtre affinités
            </span>
            <select
              className="olj-focus max-w-full rounded-md border border-border bg-background px-2 py-1.5 text-[11px] text-foreground"
              value={listFilter}
              onChange={(e) =>
                setListFilter(e.target.value === "all" ? "all" : "useful")
              }
              aria-label="Filtrer les regroupements"
            >
              <option value="useful">
                Utiles seulement (multi-pays ou multi-médias)
              </option>
              <option value="all">Tous les blocs</option>
            </select>
          </label>
          {hiddenByFilter > 0 ? (
            <span className="text-[11px] text-muted-foreground">
              {hiddenByFilter} bloc{hiddenByFilter > 1 ? "s" : ""} masqué
              {hiddenByFilter > 1 ? "s" : ""} (même pays et une seule source)
            </span>
          ) : null}
        </div>
      ) : null}
      {visibleRows.length === 0 &&
      listFilter === "useful" &&
      sortedRows.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-4 text-[13px] leading-relaxed text-muted-foreground">
          <p>
            Aucun bloc ne combine plusieurs pays ou plusieurs médias : les
            regroupements visibles sans filtre sont souvent du même journal.
            Passez à{" "}
            <button
              type="button"
              className="font-semibold text-[#c8102e] underline decoration-[#c8102e]/40 underline-offset-2 hover:decoration-[#c8102e]"
              onClick={() => setListFilter("all")}
            >
              Tous les blocs
            </button>{" "}
            pour tout parcourir, ou affinez le corpus (pays, langue) plus bas.
          </p>
        </div>
      ) : (
        <ul className="space-y-5">
          {visibleRows.map((row) => {
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
      )}
    </section>
  );
}
