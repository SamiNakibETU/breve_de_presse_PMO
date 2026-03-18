import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  score: number | null;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === null) return null;

  const pct = Math.round(score * 100);
  const color =
    score >= 0.8
      ? "bg-success/15 text-success"
      : score >= 0.6
        ? "bg-warning/15 text-warning"
        : "bg-destructive/15 text-destructive";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        color
      )}
    >
      {pct}%
    </span>
  );
}
