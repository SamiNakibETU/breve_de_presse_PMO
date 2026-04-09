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
import type { KeyboardEvent } from "react";
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

// ─── Layout constants ───────────────────────────────────────────────
const PADDING_MS = 20 * 60 * 1000;
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 96;
const TZ_BEIRUT = "Asia/Beirut";

// Rule area: 48px. Border/midnight/needle span full height.
const RULE_H = 48;

// paddingTop creates space above the rule for the needle dot without
// overflow clipping (overflow-x:auto forces overflow-y:auto per CSS spec).
const DOT_R = 5; // radius of needle circle
const SCROLL_PAD_TOP = DOT_R * 2 + 6; // 16px — safely contains the dot

// ─── Helpers ────────────────────────────────────────────────────────
function dayLabelFr(iso: string, compact = false): string {
  const [y, mo, d] = iso.split("-").map(Number);
  const utc = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, 12, 0, 0);
  if (compact) {
    const wd = new Intl.DateTimeFormat("fr-FR", {
      weekday: "short",
      timeZone: TZ_BEIRUT,
    })
      .format(utc)
      .replace(/\.$/, "")
      .slice(0, 3);
    const day = new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      timeZone: TZ_BEIRUT,
    }).format(utc);
    return `${wd}. ${day}`;
  }
  const wd = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: TZ_BEIRUT,
  })
    .format(utc)
    .replace(/\.$/, "")
    .toLowerCase();
  const dm = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: TZ_BEIRUT,
  }).format(utc);
  return `${wd}. ${dm}`;
}

// Keep only 6-hour-interval ticks (0h / 6h / 12h / 18h) — removes noise
function filter6hTicks(ticks: FriseHourTick[]): FriseHourTick[] {
  return ticks.filter((tk) => tk.beirutHour % 6 === 0);
}

// ─── Types ──────────────────────────────────────────────────────────
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

type DayMark = {
  iso: string;
  label: string;
  labelShort: string;
  pct: number;
  isActive: boolean;
  inCollectWindow: boolean;
};

type Layout = {
  windowLeftPct: number;
  windowRightPct: number;
  innerWidthPct: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  summaryA11y: string;
  ticks6h: FriseHourTick[];
  dayMarks: DayMark[];
  activeDayPct: number;
};

// ─── Component ──────────────────────────────────────────────────────
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // ── Layout (memoised) ──
  const layout = useMemo((): Layout | null => {
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
    const windowRightPct = Math.max(
      windowLeftPct + 0.35,
      windowRightPctRaw,
    );
    const innerWidthPct = ((extEnd - extStart) / coreSpan) * 100;

    const startDate = formatFriseEdgeDayFr(windowStartIso);
    const startTime = formatFriseBoundaryTimeFr(windowStartIso);
    const endDate = formatFriseEdgeDayFr(windowEndIso);
    const endTime = formatFriseBoundaryTimeFr(windowEndIso);
    const summaryA11y = `Période couverte par la revue : du ${startDate} ${startTime} au ${endDate} ${endTime}, heure de Beyrouth`;

    const allTicks = buildFriseHourTicks(extStart, extEnd, ws, we);
    const ticks6h = filter6hTicks(allTicks);

    // Active day anchor = noon Beirut of the publishRoute day
    const { y: py, m: pm, d: pd } = beirutCalendarFromRouteDateIso(publishRouteIso);
    const activeAnchorMs = findBeirutMidnightUtc(py, pm, pd) + 12 * 3600 * 1000;
    const activeDayPct = percentAlong(activeAnchorMs, extStart, extEnd);

    // Day marks — one per day in the navigation radius (at midnight)
    const dayMarks: DayMark[] = [];
    if (unifiedDayNav) {
      const radius = unifiedDayNav.dayRadius ?? 9;
      for (let i = -radius; i <= radius; i++) {
        const iso = shiftIsoDate(publishRouteIso, i);
        const { y, m, d } = beirutCalendarFromRouteDateIso(iso);
        const midnightMs = findBeirutMidnightUtc(y, m, d);
        const pct = percentAlong(midnightMs, extStart, extEnd);
        const { startMs: dayStart, endMs: dayEnd } = beirutDayBoundsFromRouteDate(iso);
        dayMarks.push({
          iso,
          label: dayLabelFr(iso, false),
          labelShort: dayLabelFr(iso, true),
          pct,
          isActive: iso === publishRouteIso,
          inCollectWindow: dayEnd > ws && dayStart < we,
        });
      }
      dayMarks.sort((a, b) => a.iso.localeCompare(b.iso, "en-CA"));
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
      ticks6h,
      dayMarks,
      activeDayPct,
    };
  }, [windowStartIso, windowEndIso, publishRouteIso, unifiedDayNav]);

  // ── Day href ──
  const dayHref = useCallback(
    (iso: string) => {
      if (!unifiedDayNav) return "#";
      if (unifiedDayNav.mode === "edition") return `/edition/${iso}`;
      if (unifiedDayNav.mode === "panorama")
        return buildPanoramaDayHref(pathname, searchParams, iso);
      const qs = mergeArticlesQuery(searchParams, {
        date: iso,
        date_from: null,
        date_to: null,
      });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [unifiedDayNav, pathname, searchParams],
  );

  // ── Centre the scroll on the active day ──
  const centerScroll = useCallback(
    (behavior: ScrollBehavior) => {
      const sc = scrollRef.current;
      const inner = innerRef.current;
      if (!layout || !sc || !inner) return;
      const innerW = inner.scrollWidth;
      const outerW = sc.clientWidth;
      if (innerW <= outerW + 1) { sc.scrollLeft = 0; return; }
      const midPx = (layout.activeDayPct / 100) * innerW;
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

  // ── NATIVE pointer drag — zero React state during scroll ──
  // This bypasses React's synthetic event system entirely,
  // eliminating re-renders and synthetic event overhead during drag.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let activeId = -1;
    let startX = 0;
    let startScroll = 0;
    let hasMoved = false;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("a")) return; // let links handle their own clicks
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      activeId = e.pointerId;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      hasMoved = false;
      el.style.cursor = "grabbing";
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      const dx = e.clientX - startX;
      if (!hasMoved && Math.abs(dx) < 4) return;
      hasMoved = true;
      el.scrollLeft = startScroll - dx;
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      activeId = -1;
      el.style.cursor = "";
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      el.scrollBy({ left: e.deltaY * 2, behavior: "auto" });
    };

    el.addEventListener("pointerdown", onDown, { passive: false });
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerup", onUp, { passive: true });
    el.addEventListener("pointercancel", onUp, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, []); // stable — pure DOM manipulation, no React deps

  // ── Arrow key scrolling ──
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); el.scrollBy({ left: -KEY_SCROLL_PX, behavior: "smooth" }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); el.scrollBy({ left: KEY_SCROLL_PX, behavior: "smooth" }); }
  }, []);

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
    ticks6h,
    dayMarks,
    activeDayPct,
  } = layout;

  const needlePct = Math.min(100, Math.max(0, activeDayPct));

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={summaryA11y}
        aria-describedby={hintId}
        className="olj-scrollbar-none w-full cursor-grab overflow-x-auto outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{
          scrollBehavior: "auto",
          paddingTop: `${SCROLL_PAD_TOP}px`,
          // GPU layer hint — prevents repaints during scroll
          willChange: "scroll-position",
        }}
        onKeyDown={onKeyDown}
      >
        <div
          ref={innerRef}
          className="relative select-none"
          style={{ width: `${innerWidthPct}%`, minWidth: "100%" }}
        >
          {/* ── START / END labels (scroll with rule when hideHeader=false) ── */}
          {!hideHeader && (
            <div className="relative mb-2" style={{ height: "3.25rem" }}>
              {/* Début */}
              <div
                className="absolute top-0"
                style={{
                  left: `${windowLeftPct}%`,
                  transform: "translateX(-2px)",
                  maxWidth: "min(48%, 12rem)",
                }}
              >
                <p
                  className="font-mono uppercase text-muted-foreground/60"
                  style={{ fontSize: "8px", letterSpacing: "0.13em" }}
                >
                  Début
                </p>
                <p className="mt-0.5 text-[11px] font-normal leading-tight tracking-tight text-foreground">
                  {startDate}
                </p>
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {startTime}
                </p>
              </div>
              {/* Fin */}
              <div
                className="absolute top-0 text-right"
                style={{
                  left: `${windowRightPct}%`,
                  transform: "translateX(calc(-100% + 2px))",
                  maxWidth: "min(48%, 12rem)",
                }}
              >
                <p
                  className="font-mono uppercase text-muted-foreground/60"
                  style={{ fontSize: "8px", letterSpacing: "0.13em" }}
                >
                  Fin
                </p>
                <p className="mt-0.5 text-[11px] font-semibold leading-tight tracking-tight text-foreground">
                  {endDate}
                </p>
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {endTime}
                </p>
              </div>
            </div>
          )}

          {/* ─────────────── RULE ─────────────── */}
          <div
            className="relative w-full"
            style={{ height: `${RULE_H}px` }}
          >
            {/* Collect window — amber background band (top stripe) */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                left: `${windowLeftPct}%`,
                width: `${Math.max(0, windowRightPct - windowLeftPct)}%`,
                height: "3px",
                background: "var(--color-accent)",
                opacity: 0.28,
                borderRadius: "1.5px",
              }}
            />

            {/* 6h-interval tick marks — minimal, purposeful */}
            {ticks6h.map((tk) => {
              const isMidnight = tk.isMidnightBeirut;
              return (
                <div
                  key={tk.ms}
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: `${tk.pct}%`,
                    transform: "translateX(-50%)",
                    width: isMidnight ? "1.5px" : "1px",
                    height: isMidnight ? `${RULE_H}px` : "12px",
                    borderRadius: "0.75px",
                    background: isMidnight
                      ? "var(--color-foreground)"
                      : "color-mix(in srgb, var(--color-foreground) 18%, transparent)",
                  }}
                />
              );
            })}

            {/* Window borders — clean black pillars */}
            {[windowLeftPct, windowRightPct].map((pct, i) => (
              <div
                key={i}
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: `${pct}%`,
                  transform: "translateX(-50%)",
                  width: "2px",
                  height: `${RULE_H}px`,
                  borderRadius: "1px",
                  background: "var(--color-foreground)",
                  zIndex: 4,
                }}
              />
            ))}

            {/* Needle — vertical accent line */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                bottom: 0,
                left: `${needlePct}%`,
                transform: "translateX(-50%)",
                width: "1px",
                height: `${RULE_H}px`,
                background: "var(--color-accent)",
                boxShadow: "0 0 6px rgba(221,59,49,0.3)",
                zIndex: 6,
              }}
            />

            {/* Needle — dot (sits above the rule, within SCROLL_PAD_TOP space) */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: `${-(DOT_R * 2 + 2)}px`,
                left: `${needlePct}%`,
                transform: "translateX(-50%)",
                width: `${DOT_R * 2}px`,
                height: `${DOT_R * 2}px`,
                borderRadius: "50%",
                background: "var(--color-accent)",
                boxShadow: `0 0 0 2.5px rgba(255,255,255,0.95), 0 2px 8px rgba(221,59,49,0.4)`,
                zIndex: 7,
              }}
            />
          </div>

          {/* ── HOUR LABELS — only at 0h / 6h / 12h / 18h ── */}
          <div
            aria-hidden
            className="relative w-full"
            style={{ height: "14px", marginTop: "4px" }}
          >
            {ticks6h.map((tk) => (
              <span
                key={`lbl-${tk.ms}`}
                className="pointer-events-none absolute top-0 select-none font-mono tabular-nums leading-none"
                style={{
                  left: `${tk.pct}%`,
                  transform: "translateX(-50%)",
                  fontSize: "8px",
                  letterSpacing: "0.04em",
                  color: tk.isMidnightBeirut
                    ? "color-mix(in srgb, var(--color-foreground) 70%, transparent)"
                    : "color-mix(in srgb, var(--color-muted-foreground) 50%, transparent)",
                  fontWeight: tk.isMidnightBeirut ? 500 : 400,
                }}
              >
                {tk.beirutHour}h
              </span>
            ))}
          </div>

          {/* ── DAY NAVIGATION — marks at day midnight, links ── */}
          {dayMarks.length > 0 && (
            <div
              role="group"
              aria-label="Navigation par jour"
              className="relative w-full"
              style={{
                marginTop: "12px",
                minHeight: "44px",
                borderTop:
                  "1px solid color-mix(in srgb, var(--color-border) 30%, transparent)",
                paddingTop: "10px",
              }}
            >
              {dayMarks.map((dm, idx) => {
                const p = Math.min(100, Math.max(0, dm.pct));
                // Stagger alternating labels when crowded
                const prev = dayMarks[idx - 1];
                const gap = prev ? Math.abs(p - Math.min(100, Math.max(0, prev.pct))) : 100;
                const crowded = gap < 5;
                const nudge = crowded && idx % 2 === 1 ? 14 : 0;

                return (
                  <Link
                    key={dm.iso}
                    href={dayHref(dm.iso)}
                    scroll={false}
                    aria-label={`Édition du ${dm.label}`}
                    aria-current={dm.isActive ? "page" : undefined}
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-1 touch-manipulation outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    style={{
                      left: `${p}%`,
                      zIndex: dm.isActive ? 40 : 10,
                      opacity: dm.isActive ? 1 : dm.inCollectWindow ? 0.85 : 0.45,
                    }}
                  >
                    {/* Tick above the separator line */}
                    <span
                      aria-hidden
                      style={{
                        display: "block",
                        width: dm.isActive ? "2px" : "1px",
                        height: dm.isActive ? "16px" : dm.inCollectWindow ? "10px" : "6px",
                        marginTop: `${-(dm.isActive ? 16 : dm.inCollectWindow ? 10 : 6) - 10}px`,
                        borderRadius: "1px",
                        background: dm.isActive
                          ? "var(--color-accent)"
                          : dm.inCollectWindow
                          ? "var(--color-foreground)"
                          : "color-mix(in srgb, var(--color-foreground) 35%, transparent)",
                        boxShadow: dm.isActive
                          ? "0 0 0 1.5px rgba(255,255,255,0.9)"
                          : "none",
                        flexShrink: 0,
                      }}
                    />
                    <span className="sr-only">
                      Aller à l&rsquo;édition du {dm.label}
                    </span>
                    <span
                      aria-hidden
                      className="whitespace-nowrap font-mono tabular-nums leading-none"
                      style={{
                        fontSize: dm.isActive ? "9.5px" : "8.5px",
                        fontWeight: dm.isActive ? 600 : 400,
                        color: dm.isActive
                          ? "var(--color-accent)"
                          : "inherit",
                        marginTop: nudge > 0 ? `${nudge}px` : undefined,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {dm.isActive ? dm.label : dm.labelShort}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* ── Footer ── */}
          <p
            className="mt-3 pb-1 text-center font-mono not-italic"
            style={{
              fontSize: "7.5px",
              letterSpacing: "0.14em",
              color:
                "color-mix(in srgb, var(--color-muted-foreground) 32%, transparent)",
            }}
          >
            FENÊTRE · BEYROUTH
          </p>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {summaryA11y}. La règle montre la fenêtre de collecte en orange.
        Ticks noirs aux minuits, gris aux 6h/12h/18h. Glisser pour
        explorer. Cliquer un jour pour y accéder.
      </span>
    </div>
  );
}
