import type { PipelineStatusKind } from "@/lib/pipeline-debug-log";

export function PipelineStatusBadge({ kind }: { kind: PipelineStatusKind }) {
  const label =
    kind === "ok"
      ? "OK"
      : kind === "error"
        ? "Erreur"
        : kind === "skip"
          ? "Ignoré"
          : "—";
  const cls =
    kind === "ok"
      ? "border border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
      : kind === "error"
        ? "border border-destructive/40 bg-destructive/10 text-destructive"
        : kind === "skip"
          ? "border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          : "border border-border bg-muted/40 text-muted-foreground";
  return (
    <span
      className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {label}
    </span>
  );
}
