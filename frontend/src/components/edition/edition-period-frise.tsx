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

function formatDayNavLabel(iso: string): string {
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
  return `${wd}. ${dateLine}`;
}

/** Libellé court pour l’axe des jours (sous la règle), quand la liste est longue. */
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

/** Hiérarchie fixe : minuit (jour) > heures collecte > heures hors collecte — mêmes hauteurs partout pour lisibilité. */
function hourTickClass(tk: FriseHourTick): string {
  const base =
    "pointer-events-none absolute bottom-0 -translate-x-1/2 rounded-[1px] transition-colors duration-150";
  if (tk.isMidnightBeirut) {
    return `${base} z-[2] h-[52px] w-[3px] bg-foreground sm:h-14 sm:w-[3px]`;
  }
  if (tk.inCollectWindow) {
    return `${base} z-[1] h-[26px] w-[2px] bg-[#f44f1e] sm:h-7 sm:w-[2px]`;
  }
  return `${base} z-[1] h-[11px] w-px bg-foreground/32 sm:h-3`;
}

const PCT_NEAR_EDGE = 0.35;

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
  windowWidthPct: number;
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
    const hourTicksDraw = filterHourTicksNearWindowEdges(
      hourTicks,
      windowLeftPct,
      windowRightPct,
    );

    let scrollCenterPct = (windowLeftPct + windowRightPct) / 2;
    const { y: py, m: pm, d: pd } = beirutCalendarFromRouteDateIso(publishRouteIso);
    const activeAnchorMs = findBeirutMidnightUtc(py, pm, pd) + 12 * 3600 * 1000;
    const activeDayPct = percentAlong(activeAnchorMs, extStart, extEnd);
    scrollCenterPct = activeDayPct;

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
      windowWidthPct,
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

  const centerScroll = useCallback(
    (behavior: ScrollBehavior) => {
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

  useLayoutEffect(() => {
    centerScroll("auto");
  }, [centerScroll]);

  useEffect(() => {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => centerScroll("auto"));
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
      behavior: "smooth",
    });
  }, []);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
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
      revealedDots: false,
    };
  }, []);

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
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
    if (d.moved && !d.revealedDots && layout && layout.dayNavItems.length > 0) {
      d.revealedDots = true;
      setDotsEmphasis(true);
    }
    el.scrollLeft = d.startScroll - dx;
  }, [layout]);

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
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
      setDotsEmphasis(false);
      try {
        scrollRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [seekScrollToClientX],
  );

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
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
      el.scrollBy({ left: e.deltaY, behavior: "smooth" });
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
    hourTicksDraw,
    dayNavItems,
    activeDayPct,
  } = layout;

  const dotPct = Math.min(100, Math.max(0, activeDayPct));
  const dayLabelCompact = dayNavItems.length > 13;

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={summaryA11y}
        aria-describedby={hintId}
        className="olj-scrollbar-none relative w-full cursor-grab touch-pan-x overflow-x-auto overflow-y-visible py-1 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing"
        style={{ scrollBehavior: "auto" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div
          ref={innerRef}
          className="relative min-w-full select-none px-0.5"
          style={{
            width: `${innerWidthPct}%`,
            minWidth: "100%",
          }}
        >
          <div className="relative mb-2 min-h-[3.25rem] w-full sm:min-h-[3.5rem]">
            <div
              className="absolute top-0 max-w-[min(48%,12rem)]"
              style={{
                left: `${windowLeftPct}%`,
                transform: "translateX(-2px)",
              }}
            >
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/90">
                Début collecte
              </p>
              <p className="mt-1 font-[family-name:var(--font-sans)] text-[11px] font-normal leading-tight tracking-tight text-foreground sm:text-xs">
                {startDate}
              </p>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                {startTime}
              </p>
            </div>
            <div
              className="absolute top-0 max-w-[min(48%,12rem)] text-right"
              style={{
                left: `${windowRightPct}%`,
                transform: "translateX(calc(-100% + 2px))",
              }}
            >
              <p className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground/90">
                Fin collecte
              </p>
              <p className="mt-1 font-[family-name:var(--font-sans)] text-[11px] font-semibold leading-tight tracking-tight text-foreground sm:text-xs">
                {endDate}
              </p>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                {endTime}
              </p>
            </div>
          </div>

          <div className="relative mx-auto w-full">
            <div className="relative mx-auto h-[52px] w-full sm:h-14">
              {hourTicksDraw.map((tk) => (
                <div
                  key={tk.ms}
                  className={hourTickClass(tk)}
                  style={{ left: `${tk.pct}%` }}
                  aria-hidden
                />
              ))}

              <div
                className="pointer-events-none absolute bottom-0 z-[5] h-[52px] w-[3px] -translate-x-1/2 bg-foreground shadow-[0_0_0_1px_rgba(244,79,30,0.22)] sm:h-14"
                style={{ left: `${windowLeftPct}%` }}
                aria-hidden
              />
              <div
                className="pointer-events-none absolute bottom-0 z-[5] h-[52px] w-[3px] -translate-x-1/2 bg-foreground shadow-[0_0_0_1px_rgba(244,79,30,0.22)] sm:h-14"
                style={{ left: `${windowRightPct}%` }}
                aria-hidden
              />

              <div
                className="pointer-events-none absolute z-[6] h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] shadow-sm ring-2 ring-background sm:h-2.5 sm:w-2.5 bottom-[52px] sm:bottom-14"
                style={{ left: `${dotPct}%` }}
                aria-hidden
              />
            </div>

            {dayNavItems.length > 0 ? (
              <div
                role="group"
                aria-label="Jours d’édition (navigation)"
                className="relative mx-auto min-h-[3.5rem] w-full border-t border-border/30 pb-1 pt-2"
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
                    if (crowded) {
                      crowdRun += 1;
                    } else {
                      crowdRun = 0;
                    }
                    const labelOffsetPx = crowded && crowdRun > 0 ? (crowdRun % 2 === 0 ? 15 : 0) : 0;
                    const emphasize = dotsEmphasis && !active;
                    const inWin = item.inCollectWindow;
                    const mark = [
                      "pointer-events-none block shrink-0 rounded-[1.5px] transition-[height,width,background-color,box-shadow] duration-150 ease-out",
                      "-mt-[7px] sm:-mt-2",
                      !inWin && !active && "h-[6px] w-px bg-foreground/25 sm:h-2 sm:w-px",
                      inWin && !active && "h-[12px] w-[2.5px] bg-[#f44f1e] sm:h-[13px]",
                      active &&
                        inWin &&
                        "h-[16px] w-[2.5px] bg-[#f44f1e] shadow-[0_0_0_1px_rgba(255,255,255,0.95)] sm:h-[18px]",
                      active &&
                        !inWin &&
                        "h-[16px] w-[2.5px] bg-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.9)] sm:h-[18px]",
                      emphasize && "ring-1 ring-[#f44f1e]/30 ring-offset-1 ring-offset-background",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const line =
                      dayLabelCompact && !active
                        ? "max-w-[2.75rem] truncate text-[9px] sm:text-[10px]"
                        : "max-w-[min(5.5rem,22vw)] truncate text-[9px] sm:max-w-[6rem] sm:text-[10px]";
                    const tone = active
                      ? "font-semibold text-[#f44f1e]"
                      : inWin
                        ? "font-medium text-foreground/88"
                        : "font-normal text-muted-foreground/90";
                    return (
                      <Link
                        key={item.iso}
                        href={dayHref(item.iso)}
                        scroll={false}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={item.label}
                        className="absolute top-0 left-1/2 flex min-w-[2.75rem] -translate-x-1/2 flex-col items-center gap-1.5 px-1.5 touch-manipulation outline-none transition-transform duration-150 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        style={{
                          left: `${p}%`,
                          zIndex: active ? 45 : 12 + idx,
                        }}
                        aria-current={active ? "true" : undefined}
                      >
                        <span className={mark} aria-hidden />
                        <span className="sr-only">Aller au {item.label}</span>
                        <span
                          aria-hidden
                          className={`whitespace-nowrap text-center font-mono tabular-nums leading-none tracking-tight ${line} ${tone}`}
                          style={
                            labelOffsetPx > 0 ? { marginTop: labelOffsetPx } : undefined
                          }
                        >
                          {dayLabelCompact ? item.labelCompact : item.label}
                        </span>
                      </Link>
                    );
                  });
                })()}
              </div>
            ) : null}

            <p className="mx-auto mt-4 max-w-lg px-4 text-center font-[family-name:var(--font-sans)] text-[11px] not-italic leading-snug tracking-tight text-muted-foreground sm:mt-5 sm:text-xs">
              Période couverte par la revue
            </p>
          </div>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {summaryA11y}. En haut : début et fin de collecte (bornes API). Sur la règle : un trait par heure — orange si
        l’heure chevauche la fenêtre de collecte ; gris court sinon ; noir plein aux minuits Beyrouth. Deux traits
        noirs avec halo discret : limites exactes de la fenêtre (sans doublon avec le trait horaire voisin). Point
        rouge : jour d’édition choisi. Sous la règle : navigation par jour d’édition ; libellés décalés en escalier
        quand les jours sont très rapprochés. Clic pour changer de jour. Glisser pour parcourir. Flèches et clic
        piste : défilement animé.
      </span>
    </div>
  );
}
