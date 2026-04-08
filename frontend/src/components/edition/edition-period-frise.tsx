"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
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
  friseDayBands,
  friseTimeStripTicks,
  friseTimeStripTicksHoursOnly,
  midnightDividerPcts,
  percentAlong,
} from "@/lib/edition-timeline-utils";
const PADDING_MS = 20 * 60 * 1000;
/** Marge temporelle de chaque côté (fraction de la plage « cœur ») pour le pan horizontal */
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 88;

const TZ_BEIRUT = "Asia/Beirut";

function formatUnifiedFriseDayChip(iso: string): { chipLine: string } {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const mo = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const wd = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: TZ_BEIRUT,
  })
    .format(utc)
    .replace(/\.$/, "")
    .toLowerCase();
  const dateLine = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: TZ_BEIRUT,
  }).format(utc);
  return { chipLine: `${wd}. ${dateLine}` };
}

/** Évite le côté « tout à gauche » : ancrage du chip selon la position sur la frise. */
function markerAnchorStyle(pct: number): CSSProperties {
  const p = Math.min(100, Math.max(0, pct));
  if (p < 7) {
    return { left: `${p}%`, transform: "translateX(0)" };
  }
  if (p > 93) {
    return { left: `${p}%`, transform: "translateX(-100%)" };
  }
  return { left: `${p}%`, transform: "translateX(-50%)" };
}

const MARKER_MIN_GAP_PCT = 3.85;

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
  chipLine: string;
  nudgeY: number;
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
  midnightPcts: number[];
  dayBands: { leftPct: number; widthPct: number }[];
  dayMarkers: DayMarker[];
  scrollCenterPct: number;
  showBoundaryLabels: boolean;
  hourStripIsTimeOnly: boolean;
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
    moved: boolean;
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
    const hourStripFn = unifiedDayNav
      ? friseTimeStripTicksHoursOnly
      : friseTimeStripTicks;
    let hourStrip = hourStripFn(extStart, extEnd, stepH);
    let guard = 0;
    while (hourStrip.length > 12 && guard < 10) {
      stepH *= 2;
      hourStrip = hourStripFn(extStart, extEnd, stepH);
      guard += 1;
    }

    const dayMarkers: DayMarker[] = [];
    let scrollCenterPct = (windowLeftPct + windowRightPct) / 2;
    if (unifiedDayNav) {
      const radius = unifiedDayNav.dayRadius ?? 14;
      const raw: Omit<DayMarker, "nudgeY">[] = [];
      for (let i = -radius; i <= radius; i += 1) {
        const iso = shiftIsoDate(publishRouteIso, i);
        const { y, m, d } = beirutCalendarFromRouteDateIso(iso);
        const anchorMs = findBeirutMidnightUtc(y, m, d) + 12 * 3600 * 1000;
        const pct = percentAlong(anchorMs, extStart, extEnd);
        const { chipLine } = formatUnifiedFriseDayChip(iso);
        raw.push({ iso, pct, chipLine });
        if (iso === publishRouteIso) {
          scrollCenterPct = pct;
        }
      }
      const sorted = [...raw].sort((a, b) => a.pct - b.pct);
      const placed: DayMarker[] = [];
      for (const cur of sorted) {
        const prev = placed[placed.length - 1];
        let nudgeY = 0;
        if (prev && Math.abs(cur.pct - prev.pct) < MARKER_MIN_GAP_PCT) {
          nudgeY = prev.nudgeY === 0 ? 13 : 0;
        }
        placed.push({ ...cur, nudgeY });
      }
      dayMarkers.push(...placed);
    }

    const navRadius = unifiedDayNav?.dayRadius ?? 14;
    const midnightPcts =
      unifiedDayNav != null
        ? midnightDividerPcts(extStart, extEnd, publishRouteIso, navRadius)
        : [];
    const dayBands =
      unifiedDayNav != null
        ? friseDayBands(extStart, extEnd, publishRouteIso, navRadius)
        : [];

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
      midnightPcts,
      dayBands,
      dayMarkers,
      scrollCenterPct,
      showBoundaryLabels: dayMarkers.length === 0,
      hourStripIsTimeOnly: unifiedDayNav != null,
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
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => centerScroll());
    });
    const sc = scrollRef.current;
    if (sc) {
      ro.observe(sc);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [centerScroll]);

  const seekScrollToClientX = useCallback((clientX: number) => {
    const sc = scrollRef.current;
    const inner = innerRef.current;
    if (!sc || !inner) {
      return;
    }
    const rect = inner.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < 0 || x > rect.width) {
      return;
    }
    const innerW = inner.scrollWidth;
    const outerW = sc.clientWidth;
    const ratio = rect.width > 0 ? x / rect.width : 0;
    const target = ratio * innerW - outerW / 2;
    sc.scrollTo({
      left: Math.max(0, Math.min(target, innerW - outerW)),
      behavior: "auto",
    });
  }, []);

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
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || e.pointerId !== d.pointerId || !el) {
      return;
    }
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) <= 8) {
        return;
      }
      d.moved = true;
    }
    el.scrollLeft = d.startScroll - dx;
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) {
      return;
    }
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) <= 8) {
      const t = (e.target as HTMLElement | null)?.closest("a[href]");
      if (!t) {
        seekScrollToClientX(e.clientX);
      }
    }
    dragRef.current = null;
    try {
      scrollRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [seekScrollToClientX]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      el.scrollBy({ left: -KEY_SCROLL_PX, behavior: "auto" });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      el.scrollBy({ left: KEY_SCROLL_PX, behavior: "auto" });
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
    midnightPcts,
    dayBands,
    dayMarkers,
    showBoundaryLabels,
    hourStripIsTimeOnly,
  } = layout;

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={summaryA11y}
        aria-describedby={hintId}
        className="olj-scrollbar-none relative w-full cursor-grab touch-pan-x overflow-x-auto overflow-y-visible rounded-xl bg-[color-mix(in_srgb,var(--color-muted)_8%,transparent)] px-0.5 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing sm:px-1 sm:py-1"
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
          {showBoundaryLabels ? (
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
          ) : null}

          {dayMarkers.length > 0 ? (
            <div className="mb-2">
              <div
                className="relative isolate min-h-[2.1rem] w-full antialiased sm:min-h-[2.25rem]"
                style={{ WebkitFontSmoothing: "antialiased" }}
              >
                {dayMarkers.map((dm) => {
                  if (dm.pct < -8 || dm.pct > 108) {
                    return null;
                  }
                  const active = dm.iso === publishRouteIso;
                  const anchor = markerAnchorStyle(dm.pct);
                  const edgeMuted =
                    !active && (dm.pct < 9 || dm.pct > 91);
                  return (
                    <Link
                      key={dm.iso}
                      href={dayHref(dm.iso)}
                      scroll={false}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label={`Jour du sommaire ${dm.iso}`}
                      className={`absolute z-[4] flex min-h-[1.75rem] min-w-[2.6rem] max-w-[min(100%,5rem)] items-center justify-center rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] leading-none no-underline transition-[color,opacity,background-color] duration-150 touch-manipulation sm:text-[11px] ${
                        active
                          ? "font-semibold text-foreground [box-shadow:inset_0_-2px_0_0_var(--color-accent)]"
                          : `text-muted-foreground/95 hover:bg-[color-mix(in_srgb,var(--color-muted)_28%,transparent)] hover:text-foreground ${edgeMuted ? "opacity-[0.55]" : ""}`
                      }`}
                      style={{ ...anchor, top: dm.nudgeY }}
                    >
                      <span className="whitespace-nowrap">{dm.chipLine}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="relative h-[2.875rem] w-full sm:h-[3.125rem]">
            {dayBands.map((b, i) => (
              <div
                key={`band-${i}-${b.leftPct.toFixed(1)}`}
                className={`pointer-events-none absolute top-0 z-0 h-[calc(100%-2px)] rounded-sm ${
                  i % 2 === 0
                    ? "bg-[color-mix(in_srgb,var(--color-muted)_12%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--color-muted)_4%,transparent)]"
                }`}
                style={{
                  left: `${b.leftPct}%`,
                  width: `${b.widthPct}%`,
                }}
                aria-hidden
              />
            ))}

            <div
              className="pointer-events-none absolute top-[3px] z-[1] h-[1.125rem] rounded-[2px] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]"
              style={{
                left: `${Math.max(0, windowLeftPct)}%`,
                width: `${Math.min(100 - Math.max(0, windowLeftPct), windowWidthPct)}%`,
              }}
              aria-hidden
            />

            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-[2] h-px bg-border/55"
              aria-hidden
            />

            {midnightPcts.map((pct, i) => (
              <div
                key={`midnight-${i}-${pct.toFixed(2)}`}
                className="pointer-events-none absolute bottom-0 z-[2] h-2 w-px -translate-x-1/2 bg-foreground/25"
                style={{ left: `${pct}%` }}
                aria-hidden
              />
            ))}

            <div
              className="pointer-events-none absolute bottom-0 z-[3] h-2.5 w-px -translate-x-1/2 bg-foreground/50"
              style={{
                left: `${windowLeftPct}%`,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 z-[3] h-2.5 w-px -translate-x-1/2 bg-foreground/50"
              style={{
                left: `${windowRightPct}%`,
              }}
              aria-hidden
            />
            <span
              className="pointer-events-none absolute bottom-[3px] left-0 z-[3] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-[var(--color-accent)] ring-2 ring-background"
              style={{ left: `${windowRightPct}%` }}
              aria-hidden
            />
          </div>

          <div
            className={`relative mt-2 w-full ${hourStripIsTimeOnly ? "min-h-[2rem]" : "min-h-[1.1rem]"}`}
            aria-hidden
          >
            {hourStripIsTimeOnly ? (
              <p className="mb-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">
                Heure · Beyrouth
              </p>
            ) : null}
            {hourStrip.map((h, i) => (
              <span
                key={`${h.pct}-${i}-${h.label}`}
                className={`pointer-events-none absolute left-0 max-w-[min(6.5rem,26vw)] -translate-x-1/2 truncate text-left font-mono text-[9px] tabular-nums tracking-tight text-muted-foreground sm:max-w-[7.5rem] sm:text-[10px] ${
                  hourStripIsTimeOnly ? "top-[1.05rem]" : "top-0"
                }`}
                style={{ left: `${h.pct}%` }}
                title={h.label}
              >
                {h.label}
              </span>
            ))}
            <span className="sr-only">
              {hourStripIsTimeOnly
                ? "Heures seules, fuseau Beyrouth ; les jours sont au-dessus et les bandes alternées marquent les nuits civiles."
                : "Graduations horaires Beyrouth avec jour indiqué au changement de date."}
            </span>
          </div>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {summaryA11y}. Ligne horizontale : axe du temps. Rectangle rosé : fenêtre du sommaire. Repères courts
        vers le haut : minuits Beyrouth. Sous l’axe : heures.
        {unifiedDayNav
          ? " Jours cliquables au-dessus. Glisser pour parcourir le contexte ; clic sur la piste pour recentrer."
          : " Changer de jour : flèches ou calendrier."}
      </span>
    </div>
  );
}
