"use client";

import { useMemo, useState, type ReactElement } from "react";
import { labFormatBoundaryDateTimeFr, labFormatDateLongFr } from "@/components/design-frise/frise-lab-datetime";
import { LAB_COLLECT, LAB_LAST_H, labClampHour, labHourInCollectDemo } from "@/components/design-frise/frise-lab-metrics";
import { LAB_DAY_START_HOURS } from "@/components/design-frise/frise-lab-snap";
import {
  UI_FRISE_META_TEXT,
  UI_SURFACE_FRise_INSET,
  UI_SURFACE_FRISE_DIVIDER,
} from "@/lib/ui-surface-classes";

/**
 * Spécimen C — **Intégration : Régie / vision « timeline » à l’échelle de la période**
 * Une seule commande sur toute la grille : la fenêtre collecte et les nuits apparaissent comme **contexte visuel**,
 * pas comme texte superposé au geste. Utile pour expliquer la couverture avant de zoomer (spécimen A ou B).
 */
export function PrototypeSpecimenFenetreGlobale(): ReactElement {
  const [hourIndex, setHourIndex] = useState(78);

  const h = labClampHour(hourIndex);
  const meta = labFormatBoundaryDateTimeFr(h);
  const inCollect = labHourInCollectDemo(h);

  const collectLeftPct = (LAB_COLLECT.startH / LAB_LAST_H) * 100;
  const collectWidthPct = ((LAB_COLLECT.endH - LAB_COLLECT.startH) / LAB_LAST_H) * 100;
  const thumbPct = (h / LAB_LAST_H) * 100;

  const dayBands = useMemo(() => {
    const bands: { left: number; width: number; key: string }[] = [];
    for (let i = 0; i < LAB_DAY_START_HOURS.length; i += 1) {
      const start = LAB_DAY_START_HOURS[i]!;
      const end = i + 1 < LAB_DAY_START_HOURS.length ? LAB_DAY_START_HOURS[i + 1]! : LAB_LAST_H;
      bands.push({
        key: `d-${start}`,
        left: (start / LAB_LAST_H) * 100,
        width: ((end - start) / LAB_LAST_H) * 100,
      });
    }
    return bands;
  }, []);

  return (
    <article className={UI_SURFACE_FRise_INSET}>
      <header className="text-center">
        <h2 className="font-[family-name:var(--font-serif)] text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          Carte de la période (démo 6 jours)
        </h2>
        <p className={`${UI_FRISE_META_TEXT} mx-auto mt-2 max-w-lg text-pretty`}>
          <span className="font-medium text-foreground">Où ça vit dans l’app :</span> bandeau d’orientation en Régie ou
          écran « santé des sources » — montrer d’un coup la fenêtre de collecte dans une ligne temporelle compacte,
          avant d’ouvrir le détail jour par jour.
        </p>
      </header>

      <div className={UI_SURFACE_FRISE_DIVIDER}>
        <div className="relative mx-auto max-w-2xl px-1 pb-1">
          <div
            className="relative h-14 overflow-hidden rounded-xl border border-border/60 bg-muted/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
            aria-hidden
          >
            {dayBands.map((b) => (
              <div
                key={b.key}
                className="absolute top-0 h-full border-r border-border/25 bg-[color-mix(in_srgb,var(--color-background)_88%,var(--color-muted)_12%)] last:border-r-0"
                style={{ left: `${b.left}%`, width: `${b.width}%` }}
              />
            ))}
            <div
              className="pointer-events-none absolute top-0 h-full rounded-sm bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] ring-1 ring-[var(--color-accent)]/35"
              style={{
                left: `${collectLeftPct}%`,
                width: `${Math.max(collectWidthPct, 0.6)}%`,
              }}
            />
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[var(--color-accent)] shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
              style={{ left: `${thumbPct}%`, transform: "translateX(-50%)" }}
            />
          </div>

          <input
            type="range"
            min={0}
            max={LAB_LAST_H}
            step={1}
            value={h}
            onChange={(e) => {
              setHourIndex(Number(e.target.value));
            }}
            className="olj-lab-range olj-lab-range--overlay absolute inset-x-0 top-0 z-[1] h-14 w-full cursor-grab opacity-0 active:cursor-grabbing"
            aria-label="Position sur la grille démo complète"
            aria-valuetext={`${meta.date} ${meta.time}`}
          />
        </div>

        <p className={`${UI_FRISE_META_TEXT} mx-auto mt-2 max-w-xl text-center`}>
          Bandes alternées = jours civils · Voile rouge = fenêtre collecte démo · Trait = repère (même index que les
          autres spécimens).
        </p>

        <div className="mx-auto mt-6 max-w-md rounded-lg border border-border/50 bg-background px-4 py-4 text-center">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Repère sélectionné
          </p>
          <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-foreground">{meta.time}</p>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{labFormatDateLongFr(h)}</p>
          {inCollect ? (
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              Dans la fenêtre collecte · démo
            </p>
          ) : null}
        </div>

        <p className={`${UI_FRISE_META_TEXT} mt-4 text-center`}>
          Intégration typique : composant en lecture seule + lien « Ouvrir la frise détaillée » vers l’écran qui
          réutilise le spécimen A (scroll + snap) ou B (jour + heure).
        </p>
      </div>
    </article>
  );
}
