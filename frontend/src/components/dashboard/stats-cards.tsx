"use client";

import type { Stats } from "@/lib/types";

type StatKey = keyof Pick<
  Stats,
  "total_collected_24h" | "total_translated" | "total_pending" | "total_errors" | "total_needs_review" | "countries_covered"
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

export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-3 border border-[#dddcda] sm:grid-cols-6">
      {STATS.map(({ key, label }, i) => (
        <div key={key} className={`px-4 py-3 ${i < STATS.length - 1 ? "border-r border-[#eeede9]" : ""}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">{label}</p>
          <p className="mt-0.5 font-[family-name:var(--font-serif)] text-[22px] tabular-nums">{loading ? "—" : (stats?.[key] ?? 0)}</p>
        </div>
      ))}
    </div>
  );
}
