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
  percentAlong,
} from "@/lib/edition-timeline-utils";

const PADDING_MS = 20 * 60 * 1000;
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 88;

/** Pas des ticks (% de la largeur totale de la piste) — identique gris / accent pour l’alignement. */
const FRISE_TICK_STEP_PCT = 2.35;

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
  dayNavItems: { iso: string; label: string }[];
  scrollCenterPct: number;
};

const GREY_TICKS = `repeating-linear-gradient(90deg, color-mix(in srgb, var(--foreground) 10%, transparent) 0, color-mix(in srgb, var(--foreground) 10%, transparent) 1px, transparent 1px, transparent ${FRISE_TICK_STEP_PCT}%)`;
const ACCENT_TICKS = `repeating-linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 72%, transparent) 0, color-mix(in srgb, var(--color-accent) 72%, transparent) 1px, transparent 1px, transparent ${FRISE_TICK_STEP_PCT}%)`;

/**
 * Frise « éditoriale » : règle minimaliste, fenêtre en accent, bornes + fin de période lisibles (réf. maquette OLJ).
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
    const windowRightPctRaw = percentAlong(we, extStart, extEnd);
    const windowWidthPct = Math.max(windowRightPctRaw - windowLeftPct, 0.35);
    const windowRightPct = windowLeftPct + windowWidthPct;
    const innerWidthPct = ((extEnd - extStart) / coreSpan) * 100;
    const startDate = formatFriseBoundaryDateFr(windowStartIso);
    const startTime = formatFriseBoundaryTimeFr(windowStartIso);
    const endDate = formatFriseBoundaryDateFr(windowEndIso);
    const endTime = formatFriseBoundaryTimeFr(windowEndIso);
    const summaryA11y = `Période couverte par la revue du ${startDate} ${startTime} au ${endDate} ${endTime}, heure de Beyrouth`;

    let scrollCenterPct = (windowLeftPct + windowRightPct) / 2;
    const dayNavItems: { iso: string; label: string }[] = [];
    if (unifiedDayNav) {
      const radius = unifiedDayNav.dayRadius ?? 9;
      for (let i = -radius; i <= radius; i += 1) {
        const iso = shiftIsoDate(publishRouteIso, i);
        dayNavItems.push({ iso, label: formatDayNavLabel(iso) });
        const { y, m, d } = beirutCalendarFromRouteDateIso(iso);
        const anchorMs = findBeirutMidnightUtc(y, m, d) + 12 * 3600 * 1000;
        if (iso === publishRouteIso) {
          scrollCenterPct = percentAlong(anchorMs, extStart, extEnd);
        }
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
      dayNavItems,
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
    const midPx = (layout.scrollCenterPct / 100) * innerW;
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

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    },
    [seekScrollToClientX],
  );

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
    innerWidthPct,
    startDate,
    startTime,
    endDate,
    endTime,
    summaryA11y,
    dayNavItems,
  } = layout;

  const clipRight = Math.max(0, 100 - windowRightPct);

  return (
    <div className={`w-full ${className}`.trim()}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label={summaryA11y}
        aria-describedby={hintId}
        className="olj-scrollbar-none relative w-full cursor-grab touch-pan-x overflow-x-auto overflow-y-visible py-1 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing"
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
          <div className="relative mb-2 min-h-[2.75rem] w-full sm:min-h-[3rem]">
            <div
              className="absolute top-0 max-w-[min(46%,11rem)]"
              style={{
                left: `${windowLeftPct}%`,
                transform: "translateX(-2px)",
              }}
            >
              <p className="font-[family-name:var(--font-sans)] text-[11px] font-normal leading-tight tracking-tight text-foreground sm:text-xs">
                {startDate}
              </p>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                {startTime}
              </p>
            </div>
            <div
              className="absolute top-0 max-w-[min(46%,11rem)] text-right"
              style={{
                left: `${windowRightPct}%`,
                transform: "translateX(calc(-100% + 2px))",
              }}
            >
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className="mb-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                  aria-hidden
                />
                <p className="font-[family-name:var(--font-sans)] text-[11px] font-semibold leading-tight tracking-tight text-foreground sm:text-xs">
                  {endDate}
                </p>
                <p className="font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                  {endTime}
                </p>
              </div>
            </div>
          </div>

          <div className="relative mx-auto h-[18px] w-full max-w-none sm:h-[20px]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: GREY_TICKS }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: ACCENT_TICKS,
                clipPath: `inset(0 ${clipRight}% 0 ${windowLeftPct}%)`,
              }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 z-[2] h-[18px] w-[2px] -translate-x-1/2 bg-foreground sm:h-5"
              style={{ left: `${windowLeftPct}%` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 z-[2] h-[18px] w-[2px] -translate-x-1/2 bg-foreground sm:h-5"
              style={{ left: `${windowRightPct}%` }}
              aria-hidden
            />
          </div>

          <p className="mx-auto mt-3 max-w-lg text-center font-[family-name:var(--font-sans)] text-[11px] italic leading-snug text-muted-foreground sm:text-xs">
            Période couverte par la revue
          </p>

          {dayNavItems.length > 0 ? (
            <nav
              className="mt-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 border-t border-border/20 pt-3 text-[11px] sm:justify-start sm:text-[12px]"
              aria-label="Autres jours"
            >
              {dayNavItems.map((item, idx) => {
                const active = item.iso === publishRouteIso;
                return (
                  <span key={item.iso} className="inline-flex items-center gap-x-1">
                    {idx > 0 ? (
                      <span className="text-muted-foreground/40" aria-hidden>
                        ·
                      </span>
                    ) : null}
                    <Link
                      href={dayHref(item.iso)}
                      scroll={false}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`font-mono tabular-nums no-underline transition-colors ${
                        active
                          ? "font-semibold text-accent"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </span>
                );
              })}
            </nav>
          ) : null}
        </div>
      </div>

      <span id={hintId} className="sr-only">
        {summaryA11y}. Ticks gris : contexte ; ticks colorés : fenêtre du sommaire. Traits noirs : début et fin
        de cette fenêtre. Point rouge : fin de période. Glisser pour parcourir ; Maj + molette horizontale.
        {unifiedDayNav
          ? " Liens : changer de jour d’édition ou de vue."
          : ""}
      </span>
    </div>
  );
}
