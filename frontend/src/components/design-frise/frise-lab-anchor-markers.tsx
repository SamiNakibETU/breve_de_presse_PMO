"use client";

import type { ReactElement } from "react";
import {
  LAB_DAY_ANCHORS,
  labHourToPx,
  labTrackWidthPx,
} from "@/components/design-frise/frise-lab-metrics";

type FriseLabAnchorMarkersProps = {
  selectedAnchorHour: number;
  /** `ryo` : micro-type, très discret. */
  density?: "default" | "ryo";
};

/**
 * Libellés courts aux ancres midi (choix discret par jour) — glisser jusqu’à aligner un jour sous le repère du milieu.
 */
export function FriseLabAnchorMarkers({
  selectedAnchorHour,
  density = "default",
}: FriseLabAnchorMarkersProps): ReactElement {
  const w = labTrackWidthPx();

  return (
    <div
      className="pointer-events-none relative w-full select-none"
      style={{ width: w, height: 20 }}
      aria-hidden
    >
      {LAB_DAY_ANCHORS.map((d) => {
        const on = d.anchorHour === selectedAnchorHour;
        const ryo = density === "ryo";
        return (
          <div
            key={d.id}
            className="absolute top-0 flex w-0 flex-col items-center"
            style={{ left: labHourToPx(d.anchorHour), transform: "translateX(-50%)" }}
            title={d.title}
          >
            <span
              className={`max-w-[3.25rem] truncate text-center leading-none ${
                ryo
                  ? `text-[8px] font-normal tracking-[0.08em] ${
                      on ? "text-foreground" : "text-muted-foreground/70"
                    }`
                  : `text-[9px] font-semibold tracking-tight sm:text-[10px] ${
                      on ? "text-[var(--color-accent)]" : "text-muted-foreground"
                    }`
              }`}
            >
              {d.label}
            </span>
            <span
              className={`rounded-full ${ryo ? "mt-1 h-px w-3" : "mt-0.5 h-0.5 w-4"} ${
                on ? "bg-[var(--color-accent)]" : "bg-border"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
