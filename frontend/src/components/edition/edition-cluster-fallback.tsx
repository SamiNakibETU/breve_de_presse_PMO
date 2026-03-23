"use client";

import Link from "next/link";
import type { ClusterFallbackRow } from "@/lib/types";

/**
 * Regroupement HDBSCAN pour l’édition quand la détection éditoriale (LLM) n’a pas produit de sujets.
 */
export function EditionClusterFallback({
  rows,
}: {
  rows: ClusterFallbackRow[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 border-t border-border pt-8">
      <div>
        <h2 className="olj-rubric olj-rule mb-2">
          Regroupement automatique (thèmes)
        </h2>
        <p className="max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
          En l’absence de grands sujets éditoriaux, voici des regroupements
          calculés sur le corpus (similarité sémantique). Ouvrez un thème pour
          voir les textes par pays.
        </p>
      </div>
      <ul className="divide-y divide-border border border-border">
        {rows.map((row) => (
          <li key={row.cluster_id} className="px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link
                href={`/clusters/${row.cluster_id}`}
                className="font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {row.label?.trim() || "Thème sans libellé"}
              </Link>
              <span className="tabular-nums text-[11px] text-muted-foreground">
                {row.article_count} texte{row.article_count > 1 ? "s" : ""}
                {row.country_count != null
                  ? ` · ${row.country_count} pays`
                  : null}
              </span>
            </div>
            {row.articles.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[12px] text-foreground-body">
                {row.articles.slice(0, 4).map((a) => (
                  <li key={a.id} className="line-clamp-2">
                    <span className="text-muted-foreground">
                      {a.source}
                      {a.country ? ` (${a.country})` : ""}
                    </span>
                    {" · "}
                    {a.title}
                  </li>
                ))}
                {row.articles.length > 4 ? (
                  <li className="text-[11px] text-muted-foreground">
                    + {row.articles.length - 4} autre
                    {row.articles.length - 4 > 1 ? "s" : ""}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
