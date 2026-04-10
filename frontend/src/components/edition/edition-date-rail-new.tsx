"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { KeyboardEvent } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  formatEditionCalendarTitleFr,
  formatFriseBoundaryTimeFr,
  formatFriseEdgeDayFr,
} from "@/lib/dates-display-fr";
import {
  beirutCalendarFromRouteDateIso,
  buildFriseHourTicks,
  extendedTimelineBounds,
  findBeirutMidnightUtc,
  percentAlong,
  type FriseHourTick,
} from "@/lib/edition-timeline-utils";

// ─── Layout constants ────────────────────────────────────────────────
const PADDING_MS = 20 * 60 * 1000;
const SIDE_PAD_RATIO = 0.42;
const KEY_SCROLL_PX = 96;
const TZ_BEIRUT = "Asia/Beirut";

// Rich-tick rule dimensions (mirrors FriseLabRichTicks in the lab)
const RULE_H = 64;        // total rule height px
const LABEL_H = 16;       // hour label row below ticks
const DOT_R = 5;
const SCROLL_PAD_TOP = DOT_R * 2 + 6; // space above for needle dot

// ─── Helpers ────────────────────────────────────────────────────────
const TZ_FMT_DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: TZ_BEIRUT });
const TZ_FMT_WD = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: TZ_BEIRUT });

function formatDaySegment(iso: string): { weekday: string; day: string } {
  const parts = iso.split("-").map(Number);
  const utc = Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1, 12, 0, 0);
  const weekday = TZ_FMT_WD.format(utc).replace(/\.$/, "").toLowerCase();
  const day = TZ_FMT_DAY.format(utc);
  return { weekday, day };
}

function dayLabelShort(iso: string): string {
  const parts = iso.split("-").map(Number);
  const utc = Date.UTC(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1, 12, 0, 0);
  const wd = TZ_FMT_WD.format(utc).replace(/\.$/, "").slice(0, 3).toLowerCase();
  const d = TZ_FMT_DAY.format(utc);
  return `${wd}. ${d}`;
}

function buildCalendarDays(currentIso: string): string[] {
  return Array.from({ length: 6 }, (_, i) => shiftIsoDate(currentIso, i - 2));
}

// ─── Tick visual params ───────────────────────────────────────────────
type TickStyle = {
  h: number;      // height px
  w: number;      // width px
  color: string;  // tailwind bg class
  opacity: number;
};

function tickStyle(tk: FriseHourTick): TickStyle {
  const { isMidnightBeirut, inCollectWindow, beirutHour } = tk;

  if (isMidnightBeirut) {
    return { h: RULE_H, w: 1.5, color: "bg-foreground", opacity: 1 };
  }
  const isQuarter = beirutHour % 6 === 0; // 6, 12, 18
  if (isQuarter) {
    return inCollectWindow
      ? { h: 32, w: 2, color: "bg-[var(--color-accent)]", opacity: 0.85 }
      : { h: 20, w: 1, color: "bg-foreground", opacity: 0.18 };
  }
  // Minor hour
  return inCollectWindow
    ? { h: 12, w: 1, color: "bg-[var(--color-accent)]", opacity: 0.45 }
    : { h: 6, w: 1, color: "bg-foreground", opacity: 0.09 };
}

function hourLabel(beirutHour: number): string | null {
  if (beirutHour % 6 !== 0) return null;
  return `${beirutHour}h`;
}

// ─── Types ───────────────────────────────────────────────────────────
export type EditionDateRailNewProps = {
  currentIso: string;
  editionWindow?: { start: string; end: string } | null;
  className?: string;
};

type Layout = {
  innerWidthPct: number;
  activeDayPct: number;
  windowLeftPct: number;
  windowRightPct: number;
  ticks: FriseHourTick[];
  dayMarks: Array<{ iso: string; label: string; pct: number; isActive: boolean }>;
};

// ─── Component ────────────────────────────────────────────────────────
/**
 * Rail date édition — design lab porté en production :
 * ticks hiérarchiques riches, accent dans la fenêtre de collecte,
 * titre animé, 18:00 / 06:00, calendrier segmenté.
 */
export function EditionDateRailNew({
  currentIso,
  editionWindow,
  className = "",
}: EditionDateRailNewProps): ReactElement {
  // ── Animated title ──
  const [visible, setVisible] = useState(true);
  const [displayIso, setDisplayIso] = useState(currentIso);
  const prevRef = useRef(currentIso);

  useEffect(() => {
    if (prevRef.current === currentIso) return;
    prevRef.current = currentIso;
    setVisible(false);
    const t = setTimeout(() => {
      setDisplayIso(currentIso);
      setVisible(true);
    }, 160);
    return () => clearTimeout(t);
  }, [currentIso]);

  const fadeClass = `transition-[opacity,transform] duration-[160ms] ease-out ${
    visible ? "translate-y-0 opacity-100" : "-translate-y-[3px] opacity-0"
  }`;

  // ── Collect window display ──
  const hasWindow = Boolean(editionWindow?.start && editionWindow?.end);
  const startTime = hasWindow ? formatFriseBoundaryTimeFr(editionWindow!.start) : null;
  const endTime = hasWindow ? formatFriseBoundaryTimeFr(editionWindow!.end) : null;
  const startDay = hasWindow ? formatFriseEdgeDayFr(editionWindow!.start) : null;
  const endDay = hasWindow ? formatFriseEdgeDayFr(editionWindow!.end) : null;

  // ── Frise layout (memoised) ──
  const layout = useMemo((): Layout | null => {
    if (!editionWindow?.start || !editionWindow?.end) return null;
    const ws = Date.parse(editionWindow.start);
    const we = Date.parse(editionWindow.end);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return null;

    const { extStart, extEnd, coreStart, coreEnd } = extendedTimelineBounds(
      ws, we, currentIso, PADDING_MS, SIDE_PAD_RATIO,
    );
    const coreSpan = coreEnd - coreStart;
    if (coreSpan <= 0) return null;

    const innerWidthPct = ((extEnd - extStart) / coreSpan) * 100;
    const windowLeftPct = percentAlong(ws, extStart, extEnd);
    const windowRightPct = Math.max(windowLeftPct + 0.35, percentAlong(we, extStart, extEnd));

    const { y: py, m: pm, d: pd } = beirutCalendarFromRouteDateIso(currentIso);
    const activeMidnightMs = findBeirutMidnightUtc(py, pm, pd);
    const activeDayPct = percentAlong(activeMidnightMs + 12 * 3600 * 1000, extStart, extEnd);

    const ticks = buildFriseHourTicks(extStart, extEnd, ws, we);

    // Day marks at midnight (1 per day in the visible range)
    const dayMarks: Layout["dayMarks"] = [];
    const seenDays = new Set<string>();
    for (const tk of ticks) {
      if (!tk.isMidnightBeirut) continue;
      // Derive ISO date from the midnight timestamp
      const isoRaw = new Intl.DateTimeFormat("en-CA", {
        year: "numeric", month: "2-digit", day: "2-digit",
        timeZone: TZ_BEIRUT,
      }).format(tk.ms);
      if (seenDays.has(isoRaw)) continue;
      seenDays.add(isoRaw);
      dayMarks.push({
        iso: isoRaw,
        label: dayLabelShort(isoRaw),
        pct: tk.pct,
        isActive: isoRaw === currentIso,
      });
    }

    return { innerWidthPct, activeDayPct, windowLeftPct, windowRightPct, ticks, dayMarks };
  }, [editionWindow, currentIso]);

  // ── Scroll refs ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

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

  // Native pointer drag — zero React state during scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let activeId = -1, startX = 0, startScroll = 0, hasMoved = false;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("a")) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      activeId = e.pointerId; startX = e.clientX; startScroll = el.scrollLeft; hasMoved = false;
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
      activeId = -1; el.style.cursor = "";
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
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); el.scrollBy({ left: -KEY_SCROLL_PX, behavior: "smooth" }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); el.scrollBy({ left: KEY_SCROLL_PX, behavior: "smooth" }); }
  }, []);

  // ── Calendar ──
  const calDays = useMemo(() => buildCalendarDays(currentIso), [currentIso]);

  const needlePct = layout ? Math.min(100, Math.max(0, layout.activeDayPct)) : 50;

  return (
    <div className={`w-full overflow-hidden ${className}`.trim()}>
      {/* ── Titre animé ── */}
      <h1
        className={`font-[family-name:var(--font-serif)] text-[1.5rem] font-normal leading-snug tracking-tight text-foreground sm:text-[1.875rem] ${fadeClass}`}
      >
        {formatEditionCalendarTitleFr(displayIso)}
      </h1>

      {/* ── Séparateur ── */}
      <div className="mt-5 h-px bg-gradient-to-r from-transparent via-border/55 to-transparent" />

      {/* ── Fenêtre collecte Signal (18:00 / 06:00) ── */}
      {startTime && endTime && startDay && endDay ? (
        <div className={`mt-5 flex items-end justify-between gap-2 ${fadeClass}`}>
          <div className="shrink-0">
            <p className="font-mono text-[1.55rem] font-extralight tabular-nums leading-none tracking-[-0.025em] text-foreground sm:text-[1.9rem]">
              {startTime}
            </p>
            <p className="mt-1.5 text-[9px] font-normal uppercase tracking-[0.18em] text-muted-foreground/70">
              {startDay}
            </p>
          </div>
          {/* Dashed line — hidden on small screens */}
          <div className="mb-[1.35rem] hidden min-w-0 flex-1 sm:block">
            <div
              className="h-px w-full"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg,color-mix(in srgb,var(--color-foreground) 13%,transparent) 0,color-mix(in srgb,var(--color-foreground) 13%,transparent) 2px,transparent 2px,transparent 7px)",
              }}
            />
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-[1.55rem] font-extralight tabular-nums leading-none tracking-[-0.025em] text-foreground sm:text-[1.9rem]">
              {endTime}
            </p>
            <p className="mt-1.5 text-[9px] font-normal uppercase tracking-[0.18em] text-muted-foreground/70">
              {endDay}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4" />
      )}

      {/* ── Frise riche (ticks hiérarchiques, données réelles) ── */}
      {layout ? (
        <div className="mt-5">
          <div
            ref={scrollRef}
            tabIndex={0}
            role="region"
            aria-label="Frise temporelle de la fenêtre de collecte"
            className="olj-scrollbar-none w-full cursor-grab overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            style={{
              scrollBehavior: "auto",
              paddingTop: `${SCROLL_PAD_TOP}px`,
              willChange: "scroll-position",
            }}
            onKeyDown={onKeyDown}
          >
            <div
              ref={innerRef}
              className="relative select-none"
              style={{ width: `${layout.innerWidthPct}%`, minWidth: "100%" }}
            >
              {/* ── Tick rule ── */}
              <div
                className="relative w-full"
                style={{ height: `${RULE_H + LABEL_H}px` }}
              >
                {layout.ticks.map((tk) => {
                  const { h, w, color, opacity } = tickStyle(tk);
                  const label = hourLabel(tk.beirutHour);
                  return (
                    <div key={tk.ms} aria-hidden>
                      {/* Tick bar */}
                      <div
                        className={`absolute ${color} transition-[height,opacity] duration-500 ease-out`}
                        style={{
                          bottom: LABEL_H,
                          left: `${tk.pct}%`,
                          transform: "translateX(-50%)",
                          width: `${w}px`,
                          height: `${h}px`,
                          opacity,
                          borderRadius: "0.75px",
                        }}
                      />
                      {/* Hour label (0h, 6h, 12h, 18h) */}
                      {label && !tk.isMidnightBeirut && (
                        <span
                          className="absolute font-mono text-muted-foreground/45"
                          style={{
                            bottom: 0,
                            left: `${tk.pct}%`,
                            transform: "translateX(-50%)",
                            fontSize: "8px",
                            lineHeight: 1,
                            letterSpacing: "0.02em",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {label}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* Needle — aiguille rouge à la position du jour actif */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute"
                  style={{
                    top: 0,
                    bottom: LABEL_H,
                    left: `${needlePct}%`,
                    transform: "translateX(-50%)",
                    zIndex: 10,
                  }}
                >
                  {/* Dot with halo */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2"
                    style={{
                      top: -DOT_R - 2,
                      width: DOT_R * 2,
                      height: DOT_R * 2,
                      borderRadius: "50%",
                      background: "var(--color-accent)",
                      boxShadow: [
                        `0 0 0 2px rgba(255,255,255,0.95)`,
                        `0 0 6px 2px color-mix(in srgb,var(--color-accent) 30%,transparent)`,
                      ].join(","),
                    }}
                  />
                  {/* Vertical line */}
                  <div
                    className="absolute inset-x-0 mx-auto"
                    style={{
                      top: DOT_R,
                      bottom: 0,
                      width: "1px",
                      background: "var(--color-accent)",
                      opacity: 0.8,
                    }}
                  />
                </div>
              </div>

              {/* ── Day markers at midnight ── */}
              {layout.dayMarks.length > 0 && (
                <div className="relative mt-1" style={{ height: "1.5rem" }}>
                  {layout.dayMarks.map(({ iso, label, pct, isActive }) => (
                    <Link
                      key={iso}
                      href={`/edition/${iso}`}
                      scroll={false}
                      aria-label={formatEditionCalendarTitleFr(iso)}
                      aria-current={isActive ? "page" : undefined}
                      className={`absolute -translate-x-1/2 text-[9px] leading-none no-underline transition-colors duration-150 ${
                        isActive
                          ? "font-semibold text-foreground"
                          : "font-normal text-muted-foreground/55 hover:text-muted-foreground"
                      }`}
                      style={{ left: `${pct}%`, top: 0 }}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] italic text-muted-foreground/40">
            Période couverte par la revue
          </p>
        </div>
      ) : null}

      {/* ── Navigation : ‹ [calendrier segmenté] › ── */}
      <div className="mt-6 flex items-center gap-1.5 sm:gap-2">
        <Link
          href={`/edition/${shiftIsoDate(currentIso, -1)}`}
          scroll={false}
          aria-label="Jour précédent"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xl font-thin text-muted-foreground/60 transition-all duration-150 hover:bg-muted/50 hover:text-foreground"
        >
          ‹
        </Link>

        <div className="flex min-w-0 flex-1 items-center rounded-[10px] bg-muted/30 p-[3px]">
          {calDays.map((iso) => {
            const on = iso === currentIso;
            const { weekday, day } = formatDaySegment(iso);
            return (
              <Link
                key={iso}
                href={`/edition/${iso}`}
                scroll={false}
                aria-label={formatEditionCalendarTitleFr(iso)}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-[2.25rem] flex-1 flex-col items-center justify-center rounded-[7px] px-0.5 py-1 no-underline transition-all duration-200 ease-out sm:px-1.5 ${
                  on
                    ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.07),inset_0_0_0_0.5px_rgba(0,0,0,0.04)]"
                    : "text-muted-foreground/65 hover:text-muted-foreground"
                }`}
              >
                <span className={`block text-[7px] uppercase leading-none tracking-[0.1em] sm:text-[7.5px] ${on ? "opacity-55" : "opacity-45"}`}>
                  {weekday}
                </span>
                <span className={`mt-0.5 block text-[11px] tabular-nums leading-none sm:text-[12px] ${on ? "font-semibold" : "font-normal"}`}>
                  {day}
                </span>
              </Link>
            );
          })}
        </div>

        <Link
          href={`/edition/${shiftIsoDate(currentIso, 1)}`}
          scroll={false}
          aria-label="Jour suivant"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-xl font-thin text-muted-foreground/60 transition-all duration-150 hover:bg-muted/50 hover:text-foreground"
        >
          ›
        </Link>
      </div>
    </div>
  );
}
