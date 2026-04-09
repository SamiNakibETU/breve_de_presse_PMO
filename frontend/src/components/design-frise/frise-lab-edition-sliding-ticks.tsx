"use client";

import { useMemo, type ReactElement } from "react";
import {
  LAB_LAST_H,
  LAB_TICK,
  labHourToPx,
  labTrackWidthPx,
} from "@/components/design-frise/frise-lab-metrics";

type FriseLabEditionSlidingTicksProps = {
  startH: number;
  endH: number;
};

/**
 * Bâtons gris hors fenêtre ; bâtons accent entre les deux filets ; filets noirs aux bornes (début / fin collecte).
 */
export function FriseLabEditionSlidingTicks({
  startH,
  endH,
}: FriseLabEditionSlidingTicksProps): ReactElement {
  const hours = useMemo(() => {
    const a: number[] = [];
    for (let h = 0; h <= LAB_LAST_H; h += 1) {
      a.push(h);
    }
    return a;
  }, []);

  const ticks = hours.map((h) => {
    const left = labHourToPx(h);
    const bottom = 0;

    if (h === startH || h === endH) {
      return (
        <div
          key={h}
          className="absolute bg-foreground"
          style={{
            left,
            bottom,
            width: LAB_TICK.wEdge,
            height: LAB_TICK.hEdge,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        />
      );
    }

    if (h > startH && h < endH) {
      return (
        <div
          key={h}
          className="absolute bg-[color-mix(in_srgb,var(--color-accent)_42%,var(--color-foreground)_6%)]"
          style={{
            left,
            bottom,
            width: LAB_TICK.wCollect,
            height: LAB_TICK.hCollect,
            transform: "translateX(-50%)",
            opacity: 0.92,
          }}
          aria-hidden
        />
      );
    }

    return (
      <div
        key={h}
        className="absolute bg-border"
        style={{
          left,
          bottom,
          width: LAB_TICK.wMinor,
          height: LAB_TICK.hMinor,
          transform: "translateX(-50%)",
        }}
        aria-hidden
      />
    );
  });

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 top-0"
      style={{ width: labTrackWidthPx() }}
    >
      {ticks}
    </div>
  );
}
