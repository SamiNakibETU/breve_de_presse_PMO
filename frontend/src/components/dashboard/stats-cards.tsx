"use client";

import type { Stats } from "@/lib/types";
import { cn } from "@/lib/utils";

type StatKey = keyof Pick<
  Stats,
  | "total_collected_24h"
  | "total_translated"
  | "total_pending"
  | "total_errors"
  | "total_needs_review"
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

/** Index éditorial : filets, pas de carte KPI façon dashboard. */
export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <section aria-label="Indicateurs du flux">
      <p className="olj-rubric olj-rule">Inventaire articles</p>
      <div className="flex flex-col border-y border-border sm:flex-row sm:flex-wrap">
        {STATS.map(({ key, label }, i) => (
          <div
            key={key}
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-1 border-border-light px-4 py-3 sm:min-w-[5.5rem] sm:flex-1 lg:min-w-0",
              i > 0 && "border-t sm:border-t-0 sm:border-l",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </p>
            <p className="font-[family-name:var(--font-serif)] text-[1.375rem] tabular-nums leading-none text-foreground">
              {loading ? "—" : (stats?.[key] ?? 0)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
