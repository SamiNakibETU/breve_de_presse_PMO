"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import { LAB_DAY_ANCHORS } from "@/components/design-frise/frise-lab-metrics";
import { UI_FRISE_CONTROL_ROW } from "@/lib/ui-surface-classes";

const PANEL = "rounded-xl border border-border/40 bg-[color-mix(in_srgb,var(--color-muted)_10%,var(--color-background))] px-4 py-4 sm:px-5";

const KICKER =
  "text-center font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground";

const SECTION_TITLE =
  "mb-3 text-center text-[11px] font-semibold leading-snug text-foreground";

const DAY_CHIP =
  "min-h-9 min-w-[3.25rem] rounded-lg border px-2.5 py-2 text-center text-[11px] font-medium tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-[3.5rem] sm:text-xs";

const STEP_BTN =
  "inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/70 bg-background px-2 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-[var(--color-accent)]/35 hover:bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-35 sm:flex-none sm:px-4";

const CAL_BTN =
  "inline-flex min-h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border/60 bg-background/50 px-2 py-2 text-muted-foreground sm:flex-none sm:min-w-[5.5rem]";

type FriseLabEditionDayPanelProps = {
  title: string;
  dayId: string;
  onDayId: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
};

/**
 * Hiérarchie explicite : d’abord le **quel jour** (pastilles), ensuite **jour par jour** (flèches étiquetées).
 */
export function FriseLabEditionDayPanel({
  title,
  dayId,
  onDayId,
  onPrev,
  onNext,
}: FriseLabEditionDayPanelProps): ReactElement {
  const idx = LAB_DAY_ANCHORS.findIndex((d) => d.id === dayId);
  const safeIdx = idx >= 0 ? idx : 0;
  const atStart = safeIdx <= 0;
  const atEnd = safeIdx >= LAB_DAY_ANCHORS.length - 1;
  const total = LAB_DAY_ANCHORS.length;

  return (
    <div className="space-y-8">
      <header className="text-center">
        <p className={KICKER}>Édition affichée</p>
        <h1 className="mt-2 font-[family-name:var(--font-serif)] text-[1.35rem] font-semibold capitalize leading-[1.15] tracking-tight text-foreground sm:text-[1.625rem]">
          {title}
        </h1>
      </header>

      <section className={PANEL} aria-labelledby="lab-frise-jour-direct">
        <h2 id="lab-frise-jour-direct" className={SECTION_TITLE}>
          1 · Choisir le jour (grille démo)
        </h2>
        <p className={`mb-3 text-center text-[10px] leading-relaxed text-muted-foreground`}>
          Un clic = cette édition ; la frise plus bas se met à jour.
        </p>
        <div
          className="flex flex-wrap justify-center gap-2"
          role="listbox"
          aria-label="Jours disponibles sur la maquette"
        >
          {LAB_DAY_ANCHORS.map((d) => {
            const selected = d.id === dayId;
            return (
              <button
                key={d.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`Édition du ${d.title}`}
                className={
                  selected
                    ? `${DAY_CHIP} border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]`
                    : `${DAY_CHIP} border-border/80 bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground`
                }
                onClick={() => {
                  onDayId(d.id);
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className={PANEL} aria-labelledby="lab-frise-jour-pas">
        <h2 id="lab-frise-jour-pas" className={SECTION_TITLE}>
          2 · Avancer d’un jour à la fois
        </h2>
        <p className={`mb-3 text-center text-[10px] leading-relaxed text-muted-foreground`}>
          Même logique que sur l’édition réelle : veille ou lendemain, sans sauter.
        </p>
        <div className={`${UI_FRISE_CONTROL_ROW} gap-2`}>
          <button
            type="button"
            className={STEP_BTN}
            disabled={atStart}
            aria-label={`Jour précédent${atStart ? " (premier jour de la démo)" : ""}`}
            onClick={onPrev}
          >
            <ChevronLeft className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span>Précédent</span>
          </button>
          <button type="button" className={CAL_BTN} disabled aria-label="Calendrier (non branché sur cette maquette)">
            <CalendarDays className="size-4 opacity-50" strokeWidth={1.75} aria-hidden />
            <span className="text-[10px] font-medium leading-tight">Calendrier</span>
            <span className="text-[9px] leading-tight text-muted-foreground/80">démo</span>
          </button>
          <button
            type="button"
            className={STEP_BTN}
            disabled={atEnd}
            aria-label={`Jour suivant${atEnd ? " (dernier jour de la démo)" : ""}`}
            onClick={onNext}
          >
            <span>Suivant</span>
            <ChevronRight className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] tabular-nums text-muted-foreground">
          Position sur la démo : {safeIdx + 1} / {total}
          {atStart ? " · premier jour" : null}
          {atEnd ? " · dernier jour" : null}
        </p>
      </section>
    </div>
  );
}
