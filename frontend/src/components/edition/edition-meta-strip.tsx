import type { ReactNode } from "react";

type EditionMetaStripProps = {
  windowCompact: string | null;
  titleAttr?: string | null;
  statsSummary: string | null;
  vigieHint: string | null;
  /** Ex. bouton « Période personnalisée », aligné avec le bloc corpus. */
  corpusCompanion?: ReactNode;
};

/**
 * Bloc unique pour la méta édition : hiérarchie fenêtre Beyrouth / corpus / aide.
 */
export function EditionMetaStrip({
  windowCompact,
  titleAttr,
  statsSummary,
  vigieHint,
  corpusCompanion,
}: EditionMetaStripProps) {
  if (!windowCompact && !statsSummary) {
    return null;
  }
  return (
    <div className="mt-4 w-full max-w-4xl border-t border-border-light pt-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-5">
        <div className="min-w-0 space-y-2">
          {windowCompact ? (
            <p
              className="text-[13px] leading-snug text-foreground"
              title={titleAttr ?? undefined}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Fenêtre éditoriale
              </span>
              <span className="mt-0.5 block tabular-nums text-foreground/95">
                {windowCompact}
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  (Beyrouth)
                </span>
              </span>
            </p>
          ) : null}
          {corpusCompanion ? <div className="flex flex-wrap items-center gap-2 pt-0.5">{corpusCompanion}</div> : null}
          {vigieHint ? (
            <p className="text-[10px] leading-snug text-muted-foreground/90">{vigieHint}</p>
          ) : null}
        </div>
        {statsSummary ? (
          <div className="min-w-0 text-left sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Corpus du sommaire
            </p>
            <p className="mt-0.5 font-[family-name:var(--font-serif)] text-[15px] font-medium tabular-nums leading-snug text-foreground">
              {statsSummary}
            </p>
          </div>
        ) : !windowCompact && corpusCompanion ? (
          <div className="sm:col-span-2">{corpusCompanion}</div>
        ) : null}
      </div>
    </div>
  );
}
