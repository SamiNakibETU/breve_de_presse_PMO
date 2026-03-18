"use client";

import type { Stats } from "@/lib/types";
import { Newspaper, CheckCircle, AlertTriangle, Globe } from "lucide-react";

interface StatsCardsProps {
  stats: Stats | null;
  loading: boolean;
}

const CARDS = [
  {
    key: "total_collected_24h" as const,
    label: "Collectés (24h)",
    icon: Newspaper,
    color: "text-accent",
  },
  {
    key: "total_translated" as const,
    label: "Traduits",
    icon: CheckCircle,
    color: "text-success",
  },
  {
    key: "total_needs_review" as const,
    label: "À relire",
    icon: AlertTriangle,
    color: "text-warning",
  },
  {
    key: "countries_covered" as const,
    label: "Pays couverts",
    icon: Globe,
    color: "text-primary",
  },
];

export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon, color }) => (
        <div
          key={key}
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <p className="mt-2 text-3xl font-bold">
            {loading ? "—" : stats?.[key] ?? 0}
          </p>
        </div>
      ))}
    </div>
  );
}
