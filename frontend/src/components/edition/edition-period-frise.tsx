"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  buildPanoramaDayHref,
  mergeArticlesQuery,
} from "@/lib/articles-url-query";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  formatFriseBoundaryDateFr,
  formatFriseBoundaryTimeFr,
} from "@/lib/dates-display-fr";
import {
  beirutCalendarFromRouteDateIso,
  extendedTimelineBounds,
  findBeirutMidnightUtc,
  hourTicksBetween,
  percentAlong,
} from "@/lib/edition-timeline-utils";

const TICK_COUNT = 96;
const PADDING_MS = 20 * 60 * 1000;
/** Marge temporelle de chaque côté (fraction de la plage « cœur ») pour le pan horizontal */
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 88;

const TZ_BEIRUT = "Asia/Beirut";

function formatUnifiedFriseDayLabels(iso: string): {
  weekdayLine: string;
  dateLine: string;
} {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const mo = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const weekdayLine = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: TZ_BEIRUT,
  })
    .format(utc)
    .replace(/\.$/, "")
    .toUpperCase();
  const dateLine = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: TZ_BEIRUT,
  }).format(utc);
  return { weekdayLine, dateLine };
}

function clampFrisePct(pct: number): number {
  return Math.min(98, Math.max(2, pct));
}

export type FriseUnifiedDayNav =
  | { mode: "edition"; dayRadius?: number }
  | { mode: "articles"; dayRadius?: number }
  | { mode: "panorama"; dayRadius?: number };

export type EditionPeriodFriseProps = {
  windowStartIso: string;
  windowEndIso: string;
  publishRouteIso: string;
  className?: string;
  /** Jours cliquables sur la frise (liens vers édition, Articles ou Panorama). */
  unifiedDayNav?: FriseUnifiedDayNav | null;
};

type HourTick = { pct: number; label: string };

type DayMarker = {
  iso: string;
  pct: number;
  weekdayLine: string;
  dateLine: string;
};

type FriseLayout = {
  windowLeftPct: number;
  windowRightPct: number;
  windowWidthPct: number;
  innerWidthPct: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  summaryA11y: string;
  hourStrip: HourTick[];
  dayMarkers: DayMarker[];
  scrollCenterPct: number;
};

/**
 * Frise temporelle : plage revue sur contexte élargi, défilable (glisser, Maj + molette, flèches).
 */
export function EditionPeriodFrise({
  windowStartIso,
  windowEndIso,
  publishRouteIso,
  className = "",
  unifiedDayNav = null,
}: EditionPeriodFriseProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hintId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
  } | null>(null);

  const layout = useMemo((): FriseLayout | null => {
    const ws = Date.parse(windowStartIso);
    const we = Date.parse(windowEndIso);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) {
      return null;
    }
    const { extStart, extEnd, coreStart, coreEnd } = extendedTimelineBounds(
      ws,
      we,
      publishRouteIso,
      PADDING_MS,
      SIDE_PAD_RATIO,
    );
    const coreSpan = coreEnd - coreStart;
    if (coreSpan <= 0) {
      return null;
    }
    const windowLeftPct = percentAlong(ws, extStart, extEnd);
    const windowRightPct = percentAlong(we, extStart, extEnd);
    const windowWidthPct = Math.max(windowRightPct - windowLeftPct, 0.35);
    const innerWidthPct = ((extEnd - extStart) / coreSpan) * 100;
    const startDate = formatFriseBoundaryDateFr(windowStartIso);
    const startTime = formatFriseBoundaryTimeFr(windowStartIso);
    const endDate = formatFriseBoundaryDateFr(windowEndIso);
    const endTime = formatFriseBoundaryTimeFr(windowEndIso);
    const summaryA11y = `Période couverte par la revue du ${startDate} ${startTime} au ${endDate} ${endTime}, heure de Beyrouth`;

    const spanMs = extEnd - extStart;
    let stepH = 6;
    if (spanMs < 16 * 3600 * 1000) {
      stepH = 3;
    }
    if (spanMs < 8 * 3600 * 1000) {
      stepH = 1;
    }
    let stripTicks = hourTicksBetween(extStart, extEnd, stepH);
    let guard = 0;
    while (stripTicks.length > 14 && guard < 10) {
      stepH *= 2;
      stripTicks = hourTicksBetween(extStart, extEnd, stepH);
      guard += 1;
    }
    const hourStrip: HourTick[] = stripTicks.map((tick) => ({
      pct: percentAlong(tick.ms, extStart, extEnd),
      label: tick.label,
    }));

    const dayMarkers: DayMarker[] = [];
    let scrollCenterPct = (windowLeftPct + windowRightPct) / 2;
    if (unifiedDayNav) {
      const radius = unifiedDayNav.dayRadius ?? 14;
      for (let i = -radius; i <= radius; i += 1) {
        const iso = shiftIsoDate(publishRouteIso, i);
        const { y, m, d } = beirutCalendarFromRouteDateIso(iso);
        const anchorMs = findBeirutMidnightUtc(y, m, d) + 12 * 3600 * 1000;
        const pct = percentAlong(anchorMs, extStart, extEnd);
        const { weekdayLine, dateLine } = formatUnifiedFriseDayLabels(iso);
        dayMarkers.push({ iso, pct, weekdayLine, dateLine });
        if (iso === publishRouteIso) {
          scrollCenterPct = pct;
        }
      }
    }

    return {
      windowLeftPct,
      windowRightPct: windowLeftPct + windowWidthPct,
      windowWidthPct,
      innerWidthPct,
      startDate,
      startTime,
      endDate,
      endTime,
      summaryA11y,
      hourStrip,
      dayMarkers,
      scrollCenterPct,
    };
  }, [windowStartIso, windowEndIso, publishRouteIso, unifiedDayNav]);

  const dayHref = useCallback(
    (iso: string) => {
      if (!unifiedDayNav) {
        return "#";
      }
      if (unifiedDayNav.mode === "edition") {
        return `/edition/${iso}`;
      }
      if (unifiedDayNav.mode === "panorama") {
        return buildPanoramaDayHref(pathname, searchParams, iso);
      }
      const qs = mergeArticlesQuery(searchParams, {
        date: iso,
        date_from: null,
        date_to: null,
      });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [unifiedDayNav, pathname, searchParams],
  );

  const centerScroll = useCallback(() => {
    const sc = scrollRef.current;
    const inner = innerRef.current;
    if (!layout || !sc || !inner) {
      return;
    }
    const innerW = inner.scrollWidth;
    const outerW = sc.clientWidth;
    if (innerW <= outerW + 1) {
      sc.scrollLeft = 0;
      return;
    }
    const midPct = layout.scrollCenterPct;
    const midPx = (midPct / 100) * innerW;
    sc.scrollLeft = Math.max(0, Math.min(midPx - outerW / 2, innerW - outerW));
  }, [layout]);

  useLayoutEffect(() => {
    centerScroll();
  }, [centerScroll]);

  useEffect(() => {
    const ro = new ResizeObserver(() => centerScroll());
    const sc = scrollRef.current;
    if (sc) {
      ro.observe(sc);
    }
    return () => ro.disconnect();
  }, [centerScroll]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || e.pointerId !== d.pointerId || !el) {
      return;
    }
    el.scrollLeft = d.startScroll - (e.clientX - d.startX);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) {
      return;
    }
    dragRef.current = null;
    try {
      scrollRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      el.scrollBy({ left: -KEY_SCROLL_PX, behavior: "smooth" });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      el.scrollBy({ left: KEY_SCROLL_PX, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout) {
      return;
    }
    const onWheelNative = (e: WheelEvent) => {
      if (!e.shiftKey) {
        return;
      }
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [layout]);

  if (!layout) {
    return null;
  }

  const {
    windowLeftPct,
    windowRightPct,
    windowWidthPct,
    innerWidthPct,
    startDate,
    startTime,
    endDate,
    endTime,
    summaryA11y,
    hourStrip,
    dayMarkers,
  } = layout;

  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => i);

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={summaryA11y}
        aria-describedby={hintId}
        className="olj-scrollbar-none relative w-full cursor-grab touch-pan-x overflow-x-auto overflow-y-visible scroll-smooth outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          ref={innerRef}
          className="relative select-none"
          style={{
            width: `${innerWidthPct}%`,
            minWidth: "100%",
          }}
        >
          <div className="relative mb-0.5 min-h-[2.5rem] sm:min-h-[2.75rem]">
            <div
              className="absolute left-0 top-0 max-w-[42%] sm:max-w-[38%]"
              style={{
                left: `${windowLeftPct}%`,
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
                left: `${windowRightPct}%`,
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

          {dayMarkers.length > 0 ? (
            <div className="relative mb-1 min-h-[3rem] w-full sm:min-h-[3.1rem]">
              {dayMarkers.map((dm) => {
                const active = dm.iso === publishRouteIso;
                const leftPct = clampFrisePct(dm.pct);
                return (
                  <Link
                    key={dm.iso}
                    href={dayHref(dm.iso)}
                    scroll={false}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-label={`Frise du sommaire · jour ${dm.iso}`}
                    className={`absolute top-0 flex min-h-[2.65rem] min-w-[2.5rem] -translate-x-1/2 flex-col items-center justify-center rounded-md px-1.5 py-1 text-center no-underline transition-[color,background-color,box-shadow] duration-200 touch-manipulation sm:min-h-[2.85rem] sm:min-w-[2.65rem] sm:px-2 ${
                      active
                        ? "z-[3] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-[color-mix(in_srgb,var(--color-accent)_42%,transparent)]"
                        : "z-[2] text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground/85"
                    }`}
                    style={{ left: `${leftPct}%` }}
                  >
                    <span className="text-[9px] font-semibold uppercase leading-none tracking-tight sm:text-[10px]">
                      {dm.weekdayLine}
                    </span>
                    <span className="mt-0.5 font-[family-name:var(--font-serif)] text-[12px] font-semibold tabular-nums leading-tight sm:text-[13px]">
                      {dm.dateLine}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : null}

          <div className="relative h-5 w-full sm:h-6">
            {ticks.map((i) => {
              const pct = TICK_COUNT <= 1 ? 0 : (i / (TICK_COUNT - 1)) * 100;
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute bottom-0 top-0 w-px bg-foreground/[0.14]"
                  style={{ left: `${pct}%` }}
                  aria-hidden
                />
              );
            })}

            <div
              className="pointer-events-none absolute bottom-0 top-0 bg-[color-mix(in_srgb,var(--color-accent)_20%,transparent)]"
              style={{
                left: `${Math.max(0, windowLeftPct)}%`,
                width: `${Math.min(100 - Math.max(0, windowLeftPct), windowWidthPct)}%`,
              }}
              aria-hidden
            />

            <div
              className="pointer-events-none absolute -top-2 bottom-0 w-[2px] bg-foreground"
              style={{
                left: `${windowLeftPct}%`,
                transform: "translateX(-50%)",
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -top-2 bottom-0 w-[2px] bg-foreground"
              style={{
                left: `${windowRightPct}%`,
                transform: "translateX(-50%)",
              }}
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -top-2.5 left-0 h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] ring-2 ring-background"
              style={{ left: `${windowRightPct}%` }}
              aria-hidden
            />
          </div>

          <div
            className="relative mt-1 h-5 w-full border-t border-border/15 pt-1"
            aria-hidden
          >
            {hourStrip.map((h, i) => (
              <span
                key={`${h.pct}-${i}`}
                className="pointer-events-none absolute left-0 top-0 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums tracking-tight text-muted-foreground sm:text-[10px]"
                style={{ left: `${h.pct}%` }}
              >
                {h.label}
              </span>
            ))}
            <span className="sr-only">
              Graduations horaires (Beyrouth) sur la plage affichée :{" "}
              {hourStrip.map((x) => x.label).join(", ")}
            </span>
          </div>
        </div>
      </div>

      <p
        id={hintId}
        className="mt-2 space-y-0.5 text-center text-[10px] text-muted-foreground sm:text-[11px]"
      >
        <span className="block italic">Période couverte par la revue</span>
        <span className="block font-normal not-italic text-[9px] leading-snug text-muted-foreground/90 sm:text-[10px]">
          Heures en bas : repères Beyrouth sur toute la plage. Glisser ici fait défiler le{" "}
          <span className="font-medium text-muted-foreground">contexte</span> (pas le jour).
          {unifiedDayNav ? (
            <>
              {" "}
              Cliquer un <span className="font-medium text-muted-foreground">jour</span> sur la frise
              ouvre la même vue à cette date ; les flèches et le calendrier au-dessus restent disponibles.
            </>
          ) : (
            <>
              {" "}
              Utiliser les flèches ou le calendrier pour changer de jour.
            </>
          )}
        </span>
      </p>
    </div>
  );
}
