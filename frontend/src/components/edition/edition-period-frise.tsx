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
  useState,
} from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  buildPanoramaDayHref,
  mergeArticlesQuery,
} from "@/lib/articles-url-query";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  formatFriseBoundaryTimeFr,
  formatFriseEdgeDayFr,
} from "@/lib/dates-display-fr";
import {
  beirutCalendarFromRouteDateIso,
  beirutDayBoundsFromRouteDate,
  buildFriseHourTicks,
  extendedTimelineBounds,
  findBeirutMidnightUtc,
  percentAlong,
  type FriseHourTick,
} from "@/lib/edition-timeline-utils";

const PADDING_MS = 20 * 60 * 1000;
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 88;
const TZ_BEIRUT = "Asia/Beirut";

// Space above rule for the needle dot — scrollRef gets this paddingTop,
// so the dot at top: -DOT_TOP_OFFSET stays within scrollRef bounds.
const DOT_DIAMETER = 10; // px
const DOT_TOP_OFFSET = DOT_DIAMETER + 4; // px above rule top edge
const SCROLL_PAD_TOP = DOT_TOP_OFFSET + 4; // px — scrollRef paddingTop

// Rule visual constants
const RULE_H = 56; // px total height of the tick rule

function formatDayNavLabel(iso: string): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const mo = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const wd = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: TZ_BEIRUT })
    .format(utc)
    .replace(/\.$/, "")
    .toLowerCase();
  const dateLine = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: TZ_BEIRUT,
  }).format(utc);
  return `${wd}. ${dateLine}`;
}

function formatDayNavCompact(iso: string): string {
  const parts = iso.split("-").map(Number);
  const mo = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const y = parts[0] ?? 1970;
  const utc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: TZ_BEIRUT,
  }).format(utc);
}

// Filter ticks too close to window border markers (avoid visual overlap)
const PCT_NEAR_EDGE = 1.0;
function filterHourTicksNearWindowEdges(
  ticks: FriseHourTick[],
  windowLeftPct: number,
  windowRightPct: number,
): FriseHourTick[] {
  return ticks.filter(
    (tk) =>
      Math.abs(tk.pct - windowLeftPct) > PCT_NEAR_EDGE &&
      Math.abs(tk.pct - windowRightPct) > PCT_NEAR_EDGE,
  );
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
  unifiedDayNav?: FriseUnifiedDayNav | null;
  hideHeader?: boolean;
};

type DayNavItem = {
  iso: string;
  label: string;
  labelCompact: string;
  pct: number;
  inCollectWindow: boolean;
};

type FriseLayout = {
  windowLeftPct: number;
  windowRightPct: number;
  innerWidthPct: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  summaryA11y: string;
  hourTicksDraw: FriseHourTick[];
  dayNavItems: DayNavItem[];
  scrollCenterPct: number;
  activeDayPct: number;
};

export function EditionPeriodFrise({
  windowStartIso,
  windowEndIso,
  publishRouteIso,
  className = "",
  unifiedDayNav = null,
  hideHeader = false,
}: EditionPeriodFriseProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hintId = useId();
  const [dotsEmphasis, setDotsEmphasis] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
    revealedDots: boolean;
  } | null>(null);

  const layout = useMemo((): FriseLayout | null => {
    const ws = Date.parse(windowStartIso);
    const we = Date.parse(windowEndIso);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return null;

    const { extStart, extEnd, coreStart, coreEnd } = extendedTimelineBounds(
      ws,
      we,
      publishRouteIso,
      PADDING_MS,
      SIDE_PAD_RATIO,
    );
    const coreSpan = coreEnd - coreStart;
    if (coreSpan <= 0) return null;

    const windowLeftPct = percentAlong(ws, extStart, extEnd);
    const windowRightPctRaw = percentAlong(we, extStart, extEnd);
    const windowWidthPct = Math.max(windowRightPctRaw - windowLeftPct, 0.35);
    const windowRightPct = windowLeftPct + windowWidthPct;
    const innerWidthPct = ((extEnd - extStart) / coreSpan) * 100;

    const startDate = formatFriseEdgeDayFr(windowStartIso);
    const startTime = formatFriseBoundaryTimeFr(windowStartIso);
    const endDate = formatFriseEdgeDayFr(windowEndIso);
    const endTime = formatFriseBoundaryTimeFr(windowEndIso);
    const summaryA11y = `Période couverte par la revue du ${startDate} ${startTime} au ${endDate} ${endTime}, heure de Beyrouth`;

    const hourTicks = buildFriseHourTicks(extStart, extEnd, ws, we);
    const hourTicksDraw = filterHourTicksNearWindowEdges(hourTicks, windowLeftPct, windowRightPct);

    const { y: py, m: pm, d: pd } = beirutCalendarFromRouteDateIso(publishRouteIso);
    const activeAnchorMs = findBeirutMidnightUtc(py, pm, pd) + 12 * 3600 * 1000;
    const activeDayPct = percentAlong(activeAnchorMs, extStart, extEnd);
    const scrollCenterPct = activeDayPct;

    const dayNavItems: DayNavItem[] = [];
    if (unifiedDayNav) {
      const radius = unifiedDayNav.dayRadius ?? 9;
      for (let i = -radius; i <= radius; i += 1) {
        const iso = shiftIsoDate(publishRouteIso, i);
        const { y, m, d } = beirutCalendarFromRouteDateIso(iso);
        const anchorMs = findBeirutMidnightUtc(y, m, d) + 12 * 3600 * 1000;
        const pct = percentAlong(anchorMs, extStart, extEnd);
        const { startMs: dayStart, endMs: dayEnd } = beirutDayBoundsFromRouteDate(iso);
        const inCollectWindow = dayEnd > ws && dayStart < we;
        dayNavItems.push({
          iso,
          label: formatDayNavLabel(iso),
          labelCompact: formatDayNavCompact(iso),
          pct,
          inCollectWindow,
        });
      }
      dayNavItems.sort((a, b) => a.iso.localeCompare(b.iso, "en-CA"));
    }

    return {
      windowLeftPct,
      windowRightPct,
      innerWidthPct,
      startDate,
      startTime,
      endDate,
      endTime,
      summaryA11y,
      hourTicksDraw,
      dayNavItems,
      scrollCenterPct,
      activeDayPct,
    };
  }, [windowStartIso, windowEndIso, publishRouteIso, unifiedDayNav]);

  const dayHref = useCallback(
    (iso: string) => {
      if (!unifiedDayNav) return "#";
      if (unifiedDayNav.mode === "edition") return `/edition/${iso}`;
      if (unifiedDayNav.mode === "panorama") return buildPanoramaDayHref(pathname, searchParams, iso);
      const qs = mergeArticlesQuery(searchParams, { date: iso, date_from: null, date_to: null });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [unifiedDayNav, pathname, searchParams],
  );

  const centerScroll = useCallback(
    (behavior: ScrollBehavior) => {
      const sc = scrollRef.current;
      const inner = innerRef.current;
      if (!layout || !sc || !inner) return;
      const innerW = inner.scrollWidth;
      const outerW = sc.clientWidth;
      if (innerW <= outerW + 1) { sc.scrollLeft = 0; return; }
      const midPx = (layout.scrollCenterPct / 100) * innerW;
      const target = Math.max(0, Math.min(midPx - outerW / 2, innerW - outerW));
      if (behavior === "smooth") {
        sc.scrollTo({ left: target, behavior: "smooth" });
      } else {
        sc.scrollLeft = target;
      }
    },
    [layout],
  );

  useLayoutEffect(() => { centerScroll("auto"); }, [centerScroll]);

  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => centerScroll("auto"));
    });
    const sc = scrollRef.current;
    if (sc) ro.observe(sc);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [centerScroll]);

  const seekScrollToClientX = useCallback((clientX: number) => {
    const sc = scrollRef.current;
    const inner = innerRef.current;
    if (!sc || !inner) return;
    const rect = inner.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < 0 || x > rect.width) return;
    const innerW = inner.scrollWidth;
    const outerW = sc.clientWidth;
    const ratio = rect.width > 0 ? x / rect.width : 0;
    sc.scrollTo({
      left: Math.max(0, Math.min(ratio * innerW - outerW / 2, innerW - outerW)),
      behavior: "smooth",
    });
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: false,
      revealedDots: false,
    };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollRef.current;
    if (!d || e.pointerId !== d.pointerId || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) <= 8) return;
      d.moved = true;
    }
    if (d.moved && !d.revealedDots && layout && layout.dayNavItems.length > 0) {
      d.revealedDots = true;
      setDotsEmphasis(true);
    }
    el.scrollLeft = d.startScroll - dx;
  }, [layout]);

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) <= 8) {
        const t = (e.target as HTMLElement | null)?.closest("a[href]");
        if (!t) seekScrollToClientX(e.clientX);
      }
      dragRef.current = null;
      setDotsEmphasis(false);
      try { scrollRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    },
    [seekScrollToClientX],
  );

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); el.scrollBy({ left: -KEY_SCROLL_PX, behavior: "smooth" }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); el.scrollBy({ left: KEY_SCROLL_PX, behavior: "smooth" }); }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout) return;
    const onWheelNative = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY, behavior: "smooth" });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, [layout]);

  if (!layout) return null;

  const {
    windowLeftPct,
    windowRightPct,
    innerWidthPct,
    startDate,
    startTime,
    endDate,
    endTime,
    summaryA11y,
    hourTicksDraw,
    dayNavItems,
    activeDayPct,
  } = layout;

  const dotPct = Math.min(100, Math.max(0, activeDayPct));
  const dayLabelCompact = dayNavItems.length > 13;

  // Inline tick styles — guaranteed to render regardless of Tailwind purge
  const tickStyle = (tk: FriseHourTick): React.CSSProperties => {
    if (tk.isMidnightBeirut) {
      return {
        position: "absolute",
        bottom: 0,
        left: `${tk.pct}%`,
        transform: "translateX(-50%)",
        width: "2px",
        height: `${RULE_H}px`,
        borderRadius: "1px",
        background: "var(--color-foreground)",
        zIndex: 3,
      };
    }
    if (tk.inCollectWindow) {
      return {
        position: "absolute",
        bottom: 0,
        left: `${tk.pct}%`,
        transform: "translateX(-50%)",
        width: "1.5px",
        height: `${Math.round(RULE_H / 2)}px`,
        borderRadius: "0.75px",
        background: "#f44f1e",
        zIndex: 2,
      };
    }
    return {
      position: "absolute",
      bottom: 0,
      left: `${tk.pct}%`,
      transform: "translateX(-50%)",
      width: "1px",
      height: "10px",
      borderRadius: "0.5px",
      background: "color-mix(in srgb, var(--color-foreground) 20%, transparent)",
      zIndex: 1,
    };
  };

  // Hour label color by context
  const hourLabelColor = (tk: FriseHourTick): string => {
    if (tk.inCollectWindow) return "#f44f1e";
    if (tk.isMidnightBeirut) return "var(--color-foreground)";
    return "color-mix(in srgb, var(--color-muted-foreground) 55%, transparent)";
  };

  return (
    <div className={`w-full ${className}`.trim()}>
      {/*
        scrollRef: overflow-x:auto forces overflow-y:auto (CSS spec constraint).
        We use paddingTop so the dot (top: -DOT_TOP_OFFSET from rule) sits at
        (paddingTop - DOT_TOP_OFFSET) px from scrollRef top → within bounds, never clipped.
      */}
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={summaryA11y}
        aria-describedby={hintId}
        className="olj-scrollbar-none relative w-full cursor-grab touch-pan-x overflow-x-auto outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing"
        style={{ scrollBehavior: "auto", paddingTop: `${SCROLL_PAD_TOP}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          ref={innerRef}
          className="relative select-none"
          style={{ width: `${innerWidthPct}%`, minWidth: "100%" }}
        >
          {/* ── START / END labels — scroll with content ── */}
          {!hideHeader && (
            <div
              className="relative mb-3 w-full"
              style={{ height: "3.5rem" }}
            >
              <div
                className="absolute top-0 max-w-[min(48%,13rem)]"
                style={{ left: `${windowLeftPct}%`, transform: "translateX(-2px)" }}
              >
                <p className="font-mono text-[8.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  Début collecte
                </p>
                <p className="mt-1 text-[11px] font-normal leading-tight tracking-tight text-foreground sm:text-[12px]">
                  {startDate}
                </p>
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                  {startTime}
                </p>
              </div>
              <div
                className="absolute top-0 max-w-[min(48%,13rem)] text-right"
                style={{ left: `${windowRightPct}%`, transform: "translateX(calc(-100% + 2px))" }}
              >
                <p className="font-mono text-[8.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                  Fin collecte
                </p>
                <p className="mt-1 text-[11px] font-semibold leading-tight tracking-tight text-foreground sm:text-[12px]">
                  {endDate}
                </p>
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                  {endTime}
                </p>
              </div>
            </div>
          )}

          {/* ── RULE — ticks · window borders · needle ── */}
          <div
            className="relative w-full"
            style={{ height: `${RULE_H}px` }}
          >
            {/* Hour ticks — inline styles, guaranteed heights */}
            {hourTicksDraw.map((tk) => (
              <div
                key={tk.ms}
                aria-hidden
                style={tickStyle(tk)}
              />
            ))}

            {/* Window left border — thick, black, subtle orange halo */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 0,
                left: `${windowLeftPct}%`,
                transform: "translateX(-50%)",
                width: "2px",
                height: `${RULE_H}px`,
                background: "var(--color-foreground)",
                boxShadow: "0 0 0 2px rgba(244,79,30,0.10)",
                zIndex: 5,
                borderRadius: "1px",
              }}
            />

            {/* Window right border */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 0,
                left: `${windowRightPct}%`,
                transform: "translateX(-50%)",
                width: "2px",
                height: `${RULE_H}px`,
                background: "var(--color-foreground)",
                boxShadow: "0 0 0 2px rgba(244,79,30,0.10)",
                zIndex: 5,
                borderRadius: "1px",
              }}
            />

            {/* Active day needle — vertical accent line, full rule height */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 0,
                left: `${dotPct}%`,
                transform: "translateX(-50%)",
                width: "1px",
                height: `${RULE_H}px`,
                background: "var(--color-accent)",
                boxShadow: "0 0 5px rgba(221,59,49,0.35)",
                zIndex: 6,
              }}
            />

            {/* Active day needle — dot, positioned above rule via negative top.
                top: -DOT_TOP_OFFSET places it at (SCROLL_PAD_TOP - DOT_TOP_OFFSET) = 4px
                from scrollRef content top — safely within bounds. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: `-${DOT_TOP_OFFSET}px`,
                left: `${dotPct}%`,
                transform: "translateX(-50%)",
                width: `${DOT_DIAMETER}px`,
                height: `${DOT_DIAMETER}px`,
                borderRadius: "50%",
                background: "var(--color-accent)",
                boxShadow: `0 0 0 2.5px rgba(255,255,255,0.95), 0 2px 10px rgba(221,59,49,0.45)`,
                zIndex: 8,
              }}
            />
          </div>

          {/* ── HOUR LABELS — 0h / 6h / 12h / 18h, colored by context ── */}
          <div
            aria-hidden
            className="relative w-full"
            style={{ height: "18px", marginTop: "3px" }}
          >
            {hourTicksDraw
              .filter((tk) => tk.beirutHour % 6 === 0)
              .map((tk) => (
                <span
                  key={`lbl-${tk.ms}`}
                  className="pointer-events-none absolute top-0 select-none font-mono tabular-nums leading-none"
                  style={{
                    left: `${tk.pct}%`,
                    transform: "translateX(-50%)",
                    fontSize: "8.5px",
                    color: hourLabelColor(tk),
                    fontWeight: tk.isMidnightBeirut ? 600 : 400,
                    letterSpacing: "0.04em",
                  }}
                >
                  {tk.beirutHour}h
                </span>
              ))}
          </div>

          {/* ── DAY NAV ZONE — markers scroll with the rule ── */}
          {dayNavItems.length > 0 && (
            <div
              role="group"
              aria-label="Navigation par jour d'édition"
              className="relative w-full"
              style={{
                marginTop: "10px",
                paddingTop: "10px",
                minHeight: "52px",
                borderTop: "1px solid color-mix(in srgb, var(--color-border) 35%, transparent)",
              }}
            >
              {(() => {
                let prevPct = -1e9;
                let crowdRun = 0;
                return dayNavItems.map((item, idx) => {
                  const active = item.iso === publishRouteIso;
                  const p = Math.min(100, Math.max(0, item.pct));
                  const gap = idx === 0 ? 100 : Math.abs(p - prevPct);
                  prevPct = p;
                  const crowded = gap < 4.75;
                  if (crowded) crowdRun += 1;
                  else crowdRun = 0;
                  const nudge = crowded && crowdRun > 0 ? (crowdRun % 2 === 0 ? 15 : 0) : 0;
                  const emphasize = dotsEmphasis && !active;
                  const inWin = item.inCollectWindow;

                  const markerH = active ? 18 : inWin ? 13 : 7;
                  const markerW = active ? 2 : inWin ? 1.5 : 1;
                  const markerBg = active
                    ? inWin ? "#f44f1e" : "var(--color-foreground)"
                    : inWin ? "#f44f1e" : "color-mix(in srgb, var(--color-foreground) 25%, transparent)";
                  const markerShadow = active
                    ? "0 0 0 1.5px rgba(255,255,255,0.9)"
                    : emphasize ? "0 0 0 1px rgba(244,79,30,0.35)" : "none";

                  const labelColor = active
                    ? "#f44f1e"
                    : inWin
                    ? "color-mix(in srgb, var(--color-foreground) 82%, transparent)"
                    : "color-mix(in srgb, var(--color-muted-foreground) 75%, transparent)";

                  return (
                    <Link
                      key={item.iso}
                      href={dayHref(item.iso)}
                      scroll={false}
                      onPointerDown={(e) => e.stopPropagation()}
                      aria-label={`Aller à l'édition du ${item.label}`}
                      aria-current={active ? "page" : undefined}
                      className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1.5 px-1.5 touch-manipulation outline-none transition-transform duration-100 active:scale-95 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      style={{ left: `${p}%`, zIndex: active ? 45 : 10 + idx }}
                    >
                      {/* Tick marker above border — via negative margin pulling it up */}
                      <span
                        aria-hidden
                        style={{
                          display: "block",
                          width: `${markerW}px`,
                          height: `${markerH}px`,
                          marginTop: `-${markerH + 10}px`,
                          borderRadius: "1px",
                          background: markerBg,
                          boxShadow: markerShadow,
                          transition: "height 150ms ease-out, box-shadow 150ms ease-out",
                          flexShrink: 0,
                        }}
                      />
                      <span className="sr-only">Aller à l&rsquo;édition du {item.label}</span>
                      <span
                        aria-hidden
                        className="whitespace-nowrap text-center font-mono tabular-nums leading-none tracking-tight"
                        style={{
                          fontSize: dayLabelCompact && !active ? "8px" : "9px",
                          fontWeight: active ? 600 : 400,
                          color: labelColor,
                          marginTop: nudge > 0 ? `${nudge}px` : undefined,
                          maxWidth: dayLabelCompact && !active ? "2.75rem" : "5.75rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {dayLabelCompact && !active ? item.labelCompact : item.label}
                      </span>
                    </Link>
                  );
                });
              })()}
            </div>
          )}

          {/* ── FOOTER label — scrolls with content ── */}
          <p
            className="mt-4 pb-2 text-center font-mono tabular-nums not-italic"
            style={{
              fontSize: "8px",
              letterSpacing: "0.12em",
              color: "color-mix(in srgb, var(--color-muted-foreground) 38%, transparent)",
            }}
          >
            PÉRIODE · BEYROUTH
          </p>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {summaryA11y}. Règle : trait pleine hauteur aux minuits Beyrouth, orange pour les heures
        de collecte, gris ailleurs. Deux traits noirs aux bornes de la fenêtre. Aiguille rouge :
        jour d&rsquo;édition actif. Glisser ou flèches pour naviguer. Cliquer un jour pour y accéder.
      </span>
    </div>
  );
}
