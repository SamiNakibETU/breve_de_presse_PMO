interface ConfidenceBadgeProps {
  score: number | null;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === null) return null;

  const pct = Math.round(score * 100);
  return (
    <span className="tabular-nums text-[12px] font-medium text-muted-foreground">
      {pct} %
    </span>
  );
}
