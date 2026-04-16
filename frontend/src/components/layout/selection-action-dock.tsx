"use client";

/**
 * Barre basse unifiée pour sélection multi-pages (Articles, cluster, etc.) — même volume visuel que l’édition.
 */
export function SelectionActionDock({
  selectionCount,
  onClear,
  primaryLabel,
  onPrimary,
  primaryDisabled,
}: {
  selectionCount: number;
  onClear: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
}) {
  if (selectionCount === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] motion-safe:animate-in motion-safe:slide-in-from-bottom-2 motion-safe:fade-in-0 motion-safe:[animation-duration:200ms]">
      <div className="pointer-events-auto mx-auto max-w-[80rem] px-4 pb-3 sm:px-6">
        <div className="rounded-2xl border border-border/70 bg-background/94 shadow-[0_-8px_32px_rgba(0,0,0,0.06)] backdrop-blur-md">
          <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-3.5">
            <div className="min-w-0 flex-1 text-center text-[12px] text-muted-foreground sm:text-left">
              <p>
                <span className="tabular-nums font-semibold text-foreground">{selectionCount}</span>{" "}
                article{selectionCount > 1 ? "s" : ""} sélectionné{selectionCount > 1 ? "s" : ""}
              </p>
              <button
                type="button"
                onClick={onClear}
                className="mt-1 text-[11px] font-medium text-foreground underline decoration-border underline-offset-2 hover:text-accent hover:decoration-accent/50"
              >
                Effacer la sélection
              </button>
            </div>
            <button
              type="button"
              onClick={onPrimary}
              disabled={primaryDisabled}
              className="olj-btn-primary w-full px-4 py-2.5 text-[13px] sm:w-auto disabled:opacity-40"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
