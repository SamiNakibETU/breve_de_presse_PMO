import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  score: number | null;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === null) return null;

  const pct = Math.round(score * 100);
  const color =
    score >= 0.8
      ? "text-success"
      : score >= 0.6
        ? "text-warning"
        : "text-destructive";

  return (
    <span className={cn("tabular-nums text-[12px] font-medium", color)}>
      {pct} %
    </span>
  );
}
