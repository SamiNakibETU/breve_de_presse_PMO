"use client";

import { cn } from "@/lib/utils";

export type ReadinessLevel = "ok" | "warn" | "empty";

export function ReadinessIndicator({
  level,
  className,
}: {
  level: ReadinessLevel;
  className?: string;
}) {
  const label =
    level === "ok"
      ? "Prêt à rédiger"
      : level === "warn"
        ? "À compléter"
        : "Aucune sélection";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        level === "ok" &&
          "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        level === "warn" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
        level === "empty" && "border-border bg-muted/30 text-muted-foreground",
        className,
      )}
      title={label}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          level === "ok" && "bg-emerald-500",
          level === "warn" && "bg-amber-500",
          level === "empty" && "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
