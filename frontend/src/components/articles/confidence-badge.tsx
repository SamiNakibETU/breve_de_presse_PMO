interface ConfidenceBadgeProps {
  score: number | null;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === null) return null;

  const pct = Math.round(score * 100);
  return (
    <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
      {pct}%
    </span>
  );
}
