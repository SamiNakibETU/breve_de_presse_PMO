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
  formatFriseBoundaryDateFr,
  formatFriseBoundaryTimeFr,
} from "@/lib/dates-display-fr";
import {
  beirutCalendarFromRouteDateIso,
  buildFriseRulerTicks,
  extendedTimelineBounds,
  findBeirutMidnightUtc,
  percentAlong,
  type FriseRulerTick,
} from "@/lib/edition-timeline-utils";

const PADDING_MS = 20 * 60 * 1000;
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 88;

/** Orange « période de collecte » (maquette éditoriale). */
const FRISE_COLLECT_HEX = "#f44f1e";

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

function tickClass(kind: FriseRulerTick["kind"]): string {
  switch (kind) {
    case "day":
      return "bottom-0 h-11 w-[2.5px] -translate-x-1/2 bg-foreground sm:h-12";
    case "major":
      return "bottom-0 h-[22px] w-px -translate-x-1/2 bg-foreground/78 sm:h-6";
    case "minor":
      return "bottom-0 h-[7px] w-px -translate-x-1/2 bg-foreground/26 sm:h-2";
  }
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

type DayNavItem = { iso: string; label: string; pct: number };

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
  rulerTicks: FriseRulerTick[];
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
    const startDate = formatFriseBoundaryDateFr(windowStartIso);
    const startTime = formatFriseBoundaryTimeFr(windowStartIso);
    const endDate = formatFriseBoundaryDateFr(windowEndIso);
    const endTime = formatFriseBoundaryTimeFr(windowEndIso);
    const summaryA11y = `Période couverte par la revue du ${startDate} ${startTime} au ${endDate} ${endTime}, heure de Beyrouth`;

    const rulerTicks = buildFriseRulerTicks(extStart, extEnd);

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
        dayNavItems.push({
          iso,
          label: formatDayNavLabel(iso),
          pct,
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
      rulerTicks,
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
    rulerTicks,
    dayNavItems,
    activeDayPct,
  } = layout;

  const dotPct = Math.min(100, Math.max(0, activeDayPct));

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
              <p className="font-[family-name:var(--font-sans)] text-[11px] font-semibold leading-tight tracking-tight text-foreground sm:text-xs">
                {endDate}
              </p>
              <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground sm:text-[11px]">
                {endTime}
              </p>
            </div>
          </div>

          <div className="relative mx-auto h-[52px] w-full sm:h-14">
            <div
              className="pointer-events-none absolute bottom-0 z-0 rounded-[1px] opacity-90"
              style={{
                left: `${Math.max(0, windowLeftPct)}%`,
                width: `${Math.min(100 - Math.max(0, windowLeftPct), windowWidthPct)}%`,
                height: "48px",
                backgroundColor: `color-mix(in srgb, ${FRISE_COLLECT_HEX} 16%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${FRISE_COLLECT_HEX} 35%, transparent)`,
              }}
              aria-hidden
            />

            <div
              className="pointer-events-none absolute z-[5] h-2 w-2 -translate-x-1/2 rounded-full bg-[var(--color-accent)] shadow-sm ring-2 ring-background sm:h-2.5 sm:w-2.5"
              style={{ left: `${dotPct}%`, bottom: "52px" }}
              aria-hidden
            />

            {rulerTicks.map((tk) => (
              <div
                key={tk.ms}
                className={`pointer-events-none absolute z-[1] ${tickClass(tk.kind)}`}
                style={{ left: `${tk.pct}%` }}
                aria-hidden
              />
            ))}

            <div
              className="pointer-events-none absolute bottom-0 z-[2] h-[52px] w-[2.5px] -translate-x-1/2 bg-foreground sm:h-14"
              style={{ left: `${windowLeftPct}%` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 z-[2] h-[52px] w-[2.5px] -translate-x-1/2 bg-foreground sm:h-14"
              style={{ left: `${windowRightPct}%` }}
              aria-hidden
            />

            {dayNavItems.map((item) => {
              const active = item.iso === publishRouteIso;
              const p = Math.min(100, Math.max(0, item.pct));
              const emphasize = dotsEmphasis && !active;
              return (
                <Link
                  key={item.iso}
                  href={dayHref(item.iso)}
                  scroll={false}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={`Ouvrir ${item.label}`}
                  className={`absolute bottom-0 z-[4] flex h-6 w-6 -translate-x-1/2 translate-y-[55%] items-center justify-center rounded-full border-2 border-[#f44f1e]/55 bg-background transition-transform duration-200 hover:scale-110 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f44f1e]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    active
                      ? "scale-110 border-[#f44f1e] bg-[color-mix(in_srgb,#f44f1e_14%,var(--color-background))]"
                      : emphasize
                        ? "animate-pulse ring-2 ring-[#f44f1e]/30"
                        : ""
                  }`}
                  style={{ left: `${p}%` }}
                  aria-current={active ? "true" : undefined}
                >
                  <span className="sr-only">Aller au {item.label}</span>
                </Link>
              );
            })}
          </div>

          <p className="mx-auto mt-8 max-w-lg text-center font-[family-name:var(--font-sans)] text-[11px] italic leading-snug text-muted-foreground sm:mt-9 sm:text-xs">
            Période couverte par la revue
          </p>

          {dayNavItems.length > 0 ? (
            <nav
              className="mt-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 border-t border-border/20 pt-3 text-[11px] sm:justify-start sm:text-[12px]"
              aria-label="Jours voisins"
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
                          ? "font-semibold text-[#f44f1e]"
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
        {summaryA11y}. Fond orange : fenêtre de collecte du sommaire. Traits noirs larges : minuits Beyrouth ;
        traits moyens : heures 6h ; fins : autres heures. Traits très larges aux extrémités : début et fin de
        collecte. Point rouge : jour d’édition affiché. Pastilles sous la règle : clic pour changer de jour.
        Glisser pour parcourir ; après un glissement, les pastilles attirent l’attention. Flèches et clic piste :
        défilement animé.
      </span>
    </div>
  );
}
