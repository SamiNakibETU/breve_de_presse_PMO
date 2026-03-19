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
    <div className="grid grid-cols-3 gap-px border border-border bg-border sm:grid-cols-6">
      {STATS.map(({ key, label }) => (
        <div key={key} className="bg-background px-4 py-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-foreground">
            {loading ? "—" : (stats?.[key] ?? 0)}
          </p>
        </div>
      ))}
    </div>
  );
}
