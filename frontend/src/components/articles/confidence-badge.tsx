interface ConfidenceBadgeProps {
  score: number | null;
}

export function ConfidenceBadge({ score }: ConfidenceBadgeProps) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "text-[#2d6a4f]" : score >= 0.6 ? "text-[#92400e]" : "text-[#c8102e]";
  return <span className={`flex-shrink-0 tabular-nums text-[11px] ${color}`}>{pct}%</span>;
}
