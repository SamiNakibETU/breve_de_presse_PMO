"use client";

import type { Stats } from "@/lib/types";

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
  { key: "total_collected_24h", label: "Collectés (24h)" },
  { key: "total_translated", label: "Traduits" },
  { key: "total_pending", label: "En attente" },
  { key: "total_errors", label: "Erreurs" },
  { key: "total_needs_review", label: "À relire" },
  { key: "countries_covered", label: "Pays" },
];

interface StatsCardsProps {
  stats: Stats | null;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <div className="font-mono text-[12px]">
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
        {STATS.map(({ key, label }, i) => (
          <span key={key} className={i > 0 ? "text-muted-foreground" : ""}>
            <span className="text-foreground/70">{label}</span>
            <span className="ml-1 tabular-nums font-medium text-foreground">
              {loading ? "—" : (stats?.[key] ?? 0)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
