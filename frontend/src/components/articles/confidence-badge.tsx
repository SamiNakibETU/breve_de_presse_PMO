interface RelevanceBadgeProps {
  score: number | null;
}

export function RelevanceBadge({ score }: RelevanceBadgeProps) {
  if (score === null) return null;
  const color =
    score >= 70 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";
  return <span className={`flex-shrink-0 tabular-nums text-[11px] ${color}`}>{score}</span>;
}

export function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  if (pct >= 70) return null;
  return (
    <span className="flex-shrink-0 tabular-nums text-[10px] text-destructive">{pct}%</span>
  );
}
