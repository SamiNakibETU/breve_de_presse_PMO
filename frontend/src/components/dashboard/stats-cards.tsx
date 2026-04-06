"use client";

import type { Stats } from "@/lib/types";

type StatKey = keyof Pick<
  Stats,
  | "total_collected_24h"
  | "total_translated"
  | "total_pending"
  | "total_needs_review"
  | "total_errors"
  | "countries_covered"
>;

const STATS: { key: StatKey; label: string }[] = [
  { key: "total_collected_24h", label: "Collectés" },
  { key: "total_translated", label: "Traduits" },
  { key: "total_pending", label: "En attente" },
  { key: "total_needs_review", label: "À relire" },
  { key: "total_errors", label: "Erreurs" },
  { key: "countries_covered", label: "Pays" },
];

interface StatsCardsProps {
  stats: Stats | null;
  loading: boolean;
}

/** Inventaire : grille légère, pas de cloisons verticales entre KPI. */
export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <section aria-label="Indicateurs du flux">
      <p className="olj-rubric olj-rule">Inventaire articles</p>
      <div className="grid grid-cols-2 gap-px rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {STATS.map(({ key, label }) => (
          <div
            key={key}
            className="flex flex-col gap-1 bg-background px-3 py-3 sm:px-4 sm:py-3.5"
          >
            <p className="text-[10px] font-medium capitalize tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="font-[family-name:var(--font-serif)] text-[1.375rem] tabular-nums leading-none text-foreground">
              {loading ? "—" : (stats?.[key] ?? 0)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground/85">Collectés</strong> : volume ingéré sur les{" "}
        <span className="tabular-nums">24 h UTC</span> glissantes (vigie globale). Les autres indicateurs
        décrivent l’état agrégé du corpus en base, indépendamment de la fenêtre d’édition du jour.
      </p>
    </section>
  );
}
