interface RelevanceBadgeProps {
  score: number | null;
}

export function RelevanceBadge({ score }: RelevanceBadgeProps) {
  if (score === null) return null;
  const color = score >= 70 ? "text-[#2d6a4f]" : score >= 50 ? "text-[#92400e]" : "text-[#c8102e]";
  return <span className={`flex-shrink-0 tabular-nums text-[11px] ${color}`}>{score}</span>;
}

export function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  if (pct >= 70) return null;
  return <span className="flex-shrink-0 tabular-nums text-[10px] text-[#c8102e]">{pct}%</span>;
}
