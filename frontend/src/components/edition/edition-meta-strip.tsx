import Link from "next/link";

type EditionMetaStripProps = {
  windowCompact: string | null;
  titleAttr?: string | null;
  statsSummary: string | null;
  vigieHint: string | null;
};

/**
 * Bloc unique pour la méta édition : hiérarchie fenêtre Beyrouth / corpus / aide.
 */
export function EditionMetaStrip({
  windowCompact,
  titleAttr,
  statsSummary,
  vigieHint,
}: EditionMetaStripProps) {
  if (!windowCompact && !statsSummary) {
    return null;
  }
  return (
    <div className="mt-4 w-full max-w-4xl border-t border-border-light pt-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-x-5">
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
        </div>
        {statsSummary ? (
          <div className="min-w-0 sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-right">
              Corpus du sommaire
            </p>
            <p className="mt-0.5 font-[family-name:var(--font-serif)] text-[15px] font-medium tabular-nums leading-snug text-foreground sm:text-right">
              {statsSummary}
            </p>
          </div>
        ) : null}
      </div>
      <details className="group mt-2 border-t border-border/30 pt-2">
        <summary className="cursor-pointer list-none py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden hover:text-foreground">
          <span className="underline decoration-border/60 underline-offset-2 group-open:no-underline">
            Aide · périmètre et chiffres
          </span>
        </summary>
        <div className="mt-1.5 space-y-1.5 text-[10px] leading-relaxed text-muted-foreground">
          <p>
            La plage du sommaire (Beyrouth) est matérialisée sur la frise du bandeau ci-dessus. Les textes listés
            correspondent à la date de parution dans cette fenêtre (mar.–ven. : veille 18 h → jour J 6 h ; lundi :
            week-end).
          </p>
          <p>
            <Link href="/regie/pipeline" className="olj-link-action font-medium">
              Horaires et pipeline automatiques
            </Link>
          </p>
          {vigieHint ? (
            <p className="text-[10px] leading-snug text-muted-foreground/90">{vigieHint}</p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
