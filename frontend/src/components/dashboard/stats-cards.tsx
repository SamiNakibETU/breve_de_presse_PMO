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
  { key: "total_collected_24h", label: "Collectés (24 h)" },
  { key: "total_translated", label: "Traduits" },
  { key: "total_pending", label: "En attente" },
  { key: "total_errors", label: "Erreurs" },
  { key: "total_needs_review", label: "À relire" },
  { key: "countries_covered", label: "Pays couverts" },
];

interface StatsCardsProps {
  stats: Stats | null;
  loading: boolean;
}

export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <div className="border-t border-border-light pt-2">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-[13px]">
        {STATS.map(({ key, label }) => (
          <div key={key} className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular-nums font-medium text-foreground">
              {loading ? "—" : (stats?.[key] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
