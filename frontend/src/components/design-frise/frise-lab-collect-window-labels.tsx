"use client";

import type { ReactElement } from "react";
import {
  labFormatBoundaryDateTimeFr,
  labFormatBoundaryShortFr,
} from "@/components/design-frise/frise-lab-datetime";
import { labHourToPx, labTrackWidthPx } from "@/components/design-frise/frise-lab-metrics";

type FriseLabCollectWindowLabelsProps = {
  startH: number;
  endH: number;
  /** `none` : pas de calque sur la piste (période affichée ailleurs). */
  mode?: "onTrack" | "none";
};

const GAP_MERGE_PX = 200;
const GAP_TIGHT_PX = 320;

/**
 * Bornes de la fenêtre collecte sur la piste — évite la superposition quand les bornes sont proches (translate -50 %).
 */
export function FriseLabCollectWindowLabels({
  startH,
  endH,
  mode = "onTrack",
}: FriseLabCollectWindowLabelsProps): ReactElement | null {
  if (mode === "none") {
    return null;
  }

  const startMeta = labFormatBoundaryDateTimeFr(startH);
  const endMeta = labFormatBoundaryDateTimeFr(endH);
  const w = labTrackWidthPx();
  const leftPx = labHourToPx(startH);
  const rightPx = labHourToPx(endH);
  const gapPx = Math.max(0, rightPx - leftPx);

  if (gapPx < GAP_MERGE_PX) {
    const shortA = labFormatBoundaryShortFr(startH);
    const shortB = labFormatBoundaryShortFr(endH);
    return (
      <div className="relative w-full select-none" style={{ width: w, minHeight: 40 }}>
        <div
          className="absolute top-0 left-1/2 max-w-[min(92%,20rem)] -translate-x-1/2 text-center"
        >
          <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {startMeta.time} → {endMeta.time}
          </p>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-foreground sm:text-xs">
            <span className="whitespace-nowrap">{shortA}</span>
            <span className="mx-1 text-muted-foreground">→</span>
            <span className="whitespace-nowrap">{shortB}</span>
          </p>
        </div>
      </div>
    );
  }

  const halfBudget = Math.max(56, Math.floor(gapPx / 2) - 10);
  const maxCol = Math.min(168, halfBudget);

  return (
    <div className="relative w-full select-none" style={{ width: w, minHeight: 44 }}>
      <div
        className="absolute top-0 text-left"
        style={{
          left: leftPx,
          transform: "translateX(0)",
          maxWidth: maxCol,
        }}
      >
        {gapPx >= GAP_TIGHT_PX ? (
          <p className="font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
            Début
          </p>
        ) : null}
        <p className="mt-0.5 truncate text-[11px] font-normal capitalize leading-tight text-foreground sm:text-xs">
          {startMeta.date}
        </p>
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
          {startMeta.time}
        </p>
      </div>
      <div
        className="absolute top-0 text-right"
        style={{
          left: rightPx,
          transform: "translateX(-100%)",
          maxWidth: maxCol,
        }}
      >
        {gapPx >= GAP_TIGHT_PX ? (
          <p className="font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">Fin</p>
        ) : null}
        <p className="mt-0.5 truncate text-[11px] font-semibold capitalize leading-tight text-foreground sm:text-xs">
          {endMeta.date}
        </p>
        <p className="mt-0.5 font-mono text-[10px] font-medium tabular-nums text-foreground sm:text-[11px]">
          {endMeta.time}
        </p>
      </div>
    </div>
  );
}
