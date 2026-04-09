"use client";

import { useMemo, useState, type ReactElement } from "react";
import {
  LAB_DAY_ANCHORS,
  LAB_DEFAULT_DAY_ID,
  LAB_LAST_H,
  labClampHour,
  labDayById,
  labHourInCollectDemo,
} from "@/components/design-frise/frise-lab-metrics";
import { labFormatBoundaryDateTimeFr, labFormatDateLongFr } from "@/components/design-frise/frise-lab-datetime";
import {
  UI_FRISE_META_TEXT,
  UI_SURFACE_FRise_INSET,
  UI_SURFACE_FRISE_DIVIDER,
} from "@/lib/ui-surface-classes";

const SEGMENT =
  "rounded-lg border px-3 py-2 text-left text-[11px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:min-w-[5.5rem] sm:px-3.5";

/**
 * Spécimen B — **Intégration : Articles / filtres « Depuis · Jusqu’au »**
 * Deux réglages séquentiels : d’abord le **jour civil**, puis l’**heure dans ce jour** sur la grille démo.
 * Aucune piste horizontale ambiguë : le curseur vertical du navigateur suffit pour l’heure.
 */
export function PrototypeSpecimenPlageJour(): ReactElement {
  const [dayId, setDayId] = useState(LAB_DEFAULT_DAY_ID);
  const day = labDayById(dayId) ?? LAB_DAY_ANCHORS[3]!;

  const { blockStart, hMin, hMax } = useMemo(() => {
    const anchor = day.anchorHour;
    const block = Math.floor(anchor / 24) * 24;
    return {
      blockStart: block,
      hMin: block,
      hMax: Math.min(block + 23, LAB_LAST_H),
    };
  }, [day.anchorHour]);

  const [offset, setOffset] = useState(() => labClampHour(day.anchorHour - blockStart));
  const hourIndex = labClampHour(blockStart + offset);

  const inCollect = labHourInCollectDemo(hourIndex);
  const meta = labFormatBoundaryDateTimeFr(hourIndex);

  return (
    <article className={UI_SURFACE_FRise_INSET}>
      <header className="text-center">
        <h2 className="font-[family-name:var(--font-serif)] text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {day.title}
        </h2>
        <p className={`${UI_FRISE_META_TEXT} mx-auto mt-2 max-w-lg text-pretty`}>
          <span className="font-medium text-foreground">Où ça vit dans l’app :</span> même découpage mental que la
          plage Articles — choisir une date, puis affiner l’heure sans confondre avec un scroll infini.
        </p>
      </header>

      <div className={UI_SURFACE_FRISE_DIVIDER}>
        <fieldset className="border-0 p-0">
          <legend className={`${UI_FRISE_META_TEXT} mb-2 block w-full text-center font-medium text-foreground`}>
            1 · Jour civil (grille démo)
          </legend>
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Choisir un jour">
            {LAB_DAY_ANCHORS.map((d) => {
              const on = d.id === dayId;
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={on}
                  className={
                    on
                      ? `${SEGMENT} border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)]`
                      : `${SEGMENT} border-border/70 bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground`
                  }
                  onClick={() => {
                    setDayId(d.id);
                    const b = Math.floor(d.anchorHour / 24) * 24;
                    const maxO = Math.min(23, LAB_LAST_H - b);
                    const nextOff = Math.min(Math.max(0, d.anchorHour - b), maxO);
                    setOffset(nextOff);
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 rounded-lg border border-border/50 bg-background px-4 py-5">
          <label
            htmlFor="lab-plage-heure"
            className="block text-center font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            2 · Heure dans ce jour ({hMin % 24}h–{hMax % 24}h sur la maquette)
          </label>
          <input
            id="lab-plage-heure"
            type="range"
            min={0}
            max={hMax - hMin}
            step={1}
            value={offset}
            onChange={(e) => {
              setOffset(Number(e.target.value));
            }}
            className="olj-lab-range mt-5 block h-3 w-full cursor-grab accent-[var(--color-accent)] active:cursor-grabbing"
            aria-valuetext={meta.time}
          />
          <div className="mt-4 text-center">
            <p className="font-mono text-[clamp(1.65rem,3.8vw,2rem)] font-medium tabular-nums text-foreground">
              {meta.time}
            </p>
            <p className="mt-1 text-sm capitalize text-muted-foreground">{labFormatDateLongFr(hourIndex)}</p>
            {inCollect ? (
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                Fenêtre collecte · démo
              </p>
            ) : null}
          </div>
        </div>

        <p className={`${UI_FRISE_META_TEXT} mt-4 text-center`}>
          Index grille résultant : <span className="font-mono tabular-nums text-foreground">{hourIndex}</span> — prêt à
          être mappé vers <code className="rounded bg-muted/50 px-1 font-mono text-[10px]">date_from</code> /{" "}
          <code className="rounded bg-muted/50 px-1 font-mono text-[10px]">date_to</code> côté API.
        </p>
      </div>
    </article>
  );
}
