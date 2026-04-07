"use client";

import { Fragment, useMemo } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  beirutDayBoundsFromRouteDate,
  hourTicksBetween,
  percentAlong,
  timelineVisibleRange,
} from "@/lib/edition-timeline-utils";

export type EditionWindowTimelineProps = {
  windowStartIso: string;
  windowEndIso: string;
  /** Paramètre de route `YYYY-MM-DD` du jour d’édition affiché. */
  publishRouteIso: string;
  variant?: "default" | "compact";
  className?: string;
};

/**
 * Axe minimaliste : fenêtre de collecte API sur fond de journées Beyrouth (veille + jour J).
 */
export function EditionWindowTimeline({
  windowStartIso,
  windowEndIso,
  publishRouteIso,
  variant = "default",
  className = "",
}: EditionWindowTimelineProps) {
  const paddingMs = variant === "compact" ? 15 * 60 * 1000 : 30 * 60 * 1000;
  /** Pas 6 h pour limiter la densité des libellés sur la frise. */
  const stepHours = 6;

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
      paddingMs,
    );
    const prevIso = shiftIsoDate(publishRouteIso, -1);
    const prevB = beirutDayBoundsFromRouteDate(prevIso);
    const curB = beirutDayBoundsFromRouteDate(publishRouteIso);
    const ticks = hourTicksBetween(rangeStart, rangeEnd, stepHours);
    const windowLeft = percentAlong(ws, rangeStart, rangeEnd);
    const windowWidth = percentAlong(we, rangeStart, rangeEnd) - windowLeft;
    const prevLeft = percentAlong(prevB.startMs, rangeStart, rangeEnd);
    const prevWidth =
      percentAlong(prevB.endMs, rangeStart, rangeEnd) - prevLeft;
    const curLeft = percentAlong(curB.startMs, rangeStart, rangeEnd);
    const curWidth =
      percentAlong(curB.endMs, rangeStart, rangeEnd) - curLeft;
    return {
      rangeStart,
      rangeEnd,
      ticks,
      windowLeft,
      windowWidth: Math.max(windowWidth, 0.8),
      prevLeft,
      prevWidth: Math.max(prevWidth, 0),
      curLeft,
      curWidth: Math.max(curWidth, 0),
    };
  }, [windowStartIso, windowEndIso, publishRouteIso, paddingMs]);

  if (!layout) {
    return null;
  }

  const hTrack = variant === "compact" ? "h-7" : "h-9";

  return (
    <div className={`w-full ${className}`.trim()}>
      {variant === "default" ? (
        <p className="mb-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
          <span className="font-medium text-foreground-subtle">
            Fenêtre de collecte (Beyrouth)
          </span>{" "}
          : intervalle réel entre les deux bornes ci-dessous (souvent veille 18 h → jour J 6 h). Les
          bandes claires marquent les{" "}
          <span className="whitespace-nowrap">nuits civiles Beyrouth</span> (veille et jour de
          parution). La rangée du haut reste le{" "}
          <span className="font-medium text-foreground-subtle">calendrier du paramètre d’URL</span>{" "}
          (jour d’édition).
        </p>
      ) : (
        <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
          Fenêtre du <span className="font-medium text-foreground-subtle">sommaire du jour</span>{" "}
          (Beyrouth) vs vue Panorama (volumes globaux).
        </p>
      )}

      <div className={`relative ${hTrack} w-full overflow-visible rounded-md bg-border/40`}>
        {/* Piste B : journées Beyrouth (fantôme) */}
        <div
          className="pointer-events-none absolute inset-y-0 rounded-md bg-muted/50"
          style={{
            left: `${Math.max(0, layout.prevLeft)}%`,
            width: `${Math.min(100 - Math.max(0, layout.prevLeft), layout.prevWidth)}%`,
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 rounded-md bg-muted/35"
          style={{
            left: `${Math.max(0, layout.curLeft)}%`,
            width: `${Math.min(100 - Math.max(0, layout.curLeft), layout.curWidth)}%`,
          }}
          aria-hidden
        />

        {/* Piste A : fenêtre API */}
        <div
          className="pointer-events-none absolute inset-y-1 rounded-sm bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
          style={{
            left: `${Math.max(0, layout.windowLeft)}%`,
            width: `${Math.min(100 - Math.max(0, layout.windowLeft), layout.windowWidth)}%`,
          }}
          aria-hidden
        />

        {/* Graduations */}
        {layout.ticks.map((tk) => {
          const pct = percentAlong(tk.ms, layout.rangeStart, layout.rangeEnd);
          if (pct < -1 || pct > 101) return null;
          return (
            <Fragment key={tk.ms}>
              <div
                className="pointer-events-none absolute bottom-0 top-0 w-px bg-border/90"
                style={{ left: `${pct}%` }}
                aria-hidden
              />
              <span
                className="pointer-events-none absolute top-full mt-1 whitespace-nowrap text-[9px] tabular-nums text-muted-foreground sm:text-[10px]"
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}
                aria-hidden
              >
                {tk.label}
              </span>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
