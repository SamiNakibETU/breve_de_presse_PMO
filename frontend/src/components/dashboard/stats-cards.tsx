"use client";

import type { Stats } from "@/lib/types";
import {
  Newspaper,
  CheckCircle,
  AlertTriangle,
  Globe,
  XCircle,
  Clock,
} from "lucide-react";

interface StatsCardsProps {
  stats: Stats | null;
  loading: boolean;
}

type StatKey =
  | "total_collected_24h"
  | "total_translated"
  | "total_pending"
  | "total_errors"
  | "total_needs_review"
  | "countries_covered";

const CARDS: {
  key: StatKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  {
    key: "total_collected_24h",
    label: "Collectés (24h)",
    icon: Newspaper,
    color: "text-accent",
  },
  {
    key: "total_translated",
    label: "Traduits",
    icon: CheckCircle,
    color: "text-success",
  },
  {
    key: "total_pending",
    label: "En attente",
    icon: Clock,
    color: "text-muted-foreground",
  },
  {
    key: "total_errors",
    label: "Erreurs",
    icon: XCircle,
    color: "text-destructive",
  },
  {
    key: "total_needs_review",
    label: "À relire",
    icon: AlertTriangle,
    color: "text-warning",
  },
  {
    key: "countries_covered",
    label: "Pays couverts",
    icon: Globe,
    color: "text-primary",
  },
];

export function StatsCards({ stats, loading }: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
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
