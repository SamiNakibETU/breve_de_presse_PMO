"use client";

import { useMemo } from "react";
import {
  formatFriseBoundaryDateFr,
  formatFriseBoundaryTimeFr,
} from "@/lib/dates-display-fr";
import {
  percentAlong,
  timelineVisibleRange,
} from "@/lib/edition-timeline-utils";

const TICK_COUNT = 96;
const PADDING_MS = 20 * 60 * 1000;

export type EditionPeriodFriseProps = {
  windowStartIso: string;
  windowEndIso: string;
  publishRouteIso: string;
  className?: string;
};

/**
 * Frise minimaliste (repère Figma) : traits verticaux, plage en accent léger,
 * marqueurs noirs aux bornes, libellés date + heure, point d’accent sur la fin.
 */
export function EditionPeriodFrise({
  windowStartIso,
  windowEndIso,
  publishRouteIso,
  className = "",
}: EditionPeriodFriseProps) {
  const layout = useMemo(() => {
    const ws = Date.parse(windowStartIso);
    const we = Date.parse(windowEndIso);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) {
      return null;
    }
    const { rangeStart, rangeEnd } = timelineVisibleRange(
      ws,
      we,
      publishRouteIso,
      PADDING_MS,
    );
    const windowLeft = percentAlong(ws, rangeStart, rangeEnd);
    const windowWidth = percentAlong(we, rangeStart, rangeEnd) - windowLeft;
    return {
      windowLeft,
      windowWidth: Math.max(windowWidth, 0.35),
      startDate: formatFriseBoundaryDateFr(windowStartIso),
      startTime: formatFriseBoundaryTimeFr(windowStartIso),
      endDate: formatFriseBoundaryDateFr(windowEndIso),
      endTime: formatFriseBoundaryTimeFr(windowEndIso),
    };
  }, [windowStartIso, windowEndIso, publishRouteIso]);

  if (!layout) {
    return null;
  }

  const { windowLeft, windowWidth, startDate, startTime, endDate, endTime } =
    layout;
  const windowRight = windowLeft + windowWidth;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => i);

  return (
    <div
      className={`w-full ${className}`.trim()}
      role="img"
      aria-label={`Période couverte par la revue du ${startDate} ${startTime} au ${endDate} ${endTime}, heure de Beyrouth`}
    >
      <div className="relative mb-0.5 min-h-[2.5rem] sm:min-h-[2.75rem]">
        <div
          className="absolute left-0 top-0 max-w-[42%] sm:max-w-[38%]"
          style={{
            left: `${windowLeft}%`,
            transform: "translateX(-1px)",
          }}
        >
          <p className="text-[12px] font-semibold leading-tight text-foreground sm:text-[13px]">
            {startDate}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
            {startTime}
          </p>
        </div>
        <div
          className="absolute top-0 max-w-[42%] text-right sm:max-w-[38%]"
          style={{
            left: `${windowRight}%`,
            transform: "translateX(calc(-100% + 1px))",
          }}
        >
          <p className="text-[12px] font-semibold leading-tight text-foreground sm:text-[13px]">
            {endDate}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
            {endTime}
          </p>
        </div>
      </div>

      <div className="relative mx-auto h-4 w-full max-w-3xl overflow-visible sm:h-[18px]">
        {ticks.map((i) => {
          const pct = TICK_COUNT <= 1 ? 0 : (i / (TICK_COUNT - 1)) * 100;
          return (
            <div
              key={i}
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-foreground/10"
              style={{ left: `${pct}%` }}
              aria-hidden
            />
          );
        })}

        <div
          className="pointer-events-none absolute bottom-0 top-0 bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]"
          style={{
            left: `${Math.max(0, windowLeft)}%`,
            width: `${Math.min(100 - Math.max(0, windowLeft), windowWidth)}%`,
          }}
          aria-hidden
        />

        <div
          className="pointer-events-none absolute -top-1.5 bottom-0 w-px bg-foreground"
          style={{
            left: `${windowLeft}%`,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-1.5 bottom-0 w-px bg-foreground"
          style={{
            left: `${windowRight}%`,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -top-2 left-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--color-accent)]"
          style={{ left: `${windowRight}%` }}
          aria-hidden
        />
      </div>

      <p className="mt-2 text-center text-[10px] italic text-muted-foreground sm:text-[11px]">
        Période couverte par la revue
      </p>
    </div>
  );
}
