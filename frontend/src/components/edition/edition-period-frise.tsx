"use client";

/**
 * EditionPeriodFrise — timeline multi-jours scrollable (snap par jour).
 * Affiche 7 jours (J-3 … J+3) avec :
 *  - ticks horaires hiérarchiques (minuit > 6h > 3h > 1h)
 *  - bande de collecte (fenêtre édition, rouge OLJ) + bande d'actualisation (16h Paris ≈ 18h Beirut, ambre)
 *  - indicateur LIVE (ligne + dot) quand la vue inclut l'instant présent
 *  - snap au jour le plus proche au relâchement
 *  - navigation vers la date cliquée
 *  - icône calendrier popover
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  buildPanoramaDayHref,
  mergeArticlesQuery,
} from "@/lib/articles-url-query";
import { shiftIsoDate } from "@/lib/beirut-date";
import { api } from "@/lib/api";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import type { Edition } from "@/lib/types";

const TZ = "Asia/Beirut";
const H = 3_600_000;
const DAY_RADIUS = 3; // days before + after
const TOTAL_DAYS = DAY_RADIUS * 2 + 1; // 7
const DAYS_VISIBLE = 3; // columns visible at once

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/* ── Types ── */
export type FriseUnifiedDayNav =
  | { mode: "edition"; dayRadius?: number }
  | { mode: "articles"; dayRadius?: number }
  | { mode: "panorama"; dayRadius?: number };

export type EditionPeriodFriseProps = {
  /** Date courante au format YYYY-MM-DD (route param). */
  publishRouteIso: string;
  /** Mode de navigation lors d'un clic sur un jour. */
  unifiedDayNav?: FriseUnifiedDayNav | null;
  /** Compat : si fourni, utilisé comme fallback pour la fenêtre de l'édition centrale. */
  windowStartIso?: string;
  windowEndIso?: string;
  className?: string;
  compact?: boolean;
};

/* ── Tick geometry ── */
type TickKind = "midnight" | "major" | "minor" | "mini";
type Tick = { pctInDay: number; h: number; kind: TickKind };

function tickKind(h: number): TickKind {
  if (h === 0) return "midnight";
  if (h % 6 === 0) return "major";
  if (h % 3 === 0) return "minor";
  return "mini";
}

const TICK_H: Record<TickKind, number> = { midnight: 28, major: 16, minor: 9, mini: 3 };
const TICK_W: Record<TickKind, number> = { midnight: 1.5, major: 1, minor: 0.75, mini: 0.5 };
function tickOpacity(k: TickKind): number {
  if (k === "midnight") return 0.72;
  if (k === "major") return 0.32;
  if (k === "minor") return 0.14;
  return 0.06;
}

/* ── Day ticks (24h, midnight→midnight Beirut) ── */
function dayTicks(): Tick[] {
  const ticks: Tick[] = [];
  for (let h = 0; h < 24; h++) {
    ticks.push({ pctInDay: (h / 24) * 100, h, kind: tickKind(h) });
  }
  return ticks;
}
const DAY_TICKS = dayTicks();

/* ── Edition window → zones within a day ── */
type Band = { startPct: number; widthPct: number; color: string; label: string };

/**
 * Calculates colored bands for a day column [dayStartMs, dayStartMs+24h).
 * `ws` / `we` = edition window (UTC ms). `afternoonMs` = start of actualisation within the day.
 */
function bandsForDay(dayStartMs: number, ws: number | null, we: number | null): Band[] {
  if (ws == null || we == null || we <= ws) return [];
  const dayEndMs = dayStartMs + 24 * H;
  const bands: Band[] = [];

  // Collecte band: intersection of [ws, we) with [dayStart, dayEnd)
  const cStart = Math.max(ws, dayStartMs);
  const cEnd = Math.min(we, dayEndMs);
  if (cEnd > cStart) {
    bands.push({
      startPct: ((cStart - dayStartMs) / (24 * H)) * 100,
      widthPct: ((cEnd - cStart) / (24 * H)) * 100,
      color: "var(--color-accent)",
      label: "Collecte",
    });
  }

  // Actualisation: approximately 16h Paris → 18h Beirut (UTC+3 in summer) = we - 2h
  // We approximate: last 25% of the collection window within this day
  if (we > dayStartMs && ws < dayEndMs && we > ws) {
    const windowDur = we - ws;
    const actuStart = Math.max(ws + windowDur * 0.6, dayStartMs);
    const actuEnd = Math.min(we, dayEndMs);
    if (actuEnd > actuStart) {
      bands.push({
        startPct: ((actuStart - dayStartMs) / (24 * H)) * 100,
        widthPct: ((actuEnd - actuStart) / (24 * H)) * 100,
        color: "#f59e0b",
        label: "Actualisation",
      });
    }
  }

  return bands;
}

/* ── Midnight ms for a YYYY-MM-DD in Beirut ── */
function beirutMidnightMs(iso: string): number {
  // Find the UTC ms where Beyrouth is midnight on that date
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y!, (m! - 1), d!);
  // Binary-ish: try 0h–4h UTC window
  for (let offset = -2 * H; offset <= 6 * H; offset += 60_000) {
    const t = guess + offset;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(t));
    const h = parseInt(parts.find(p => p.type === "hour")?.value ?? "1", 10);
    const min = parseInt(parts.find(p => p.type === "minute")?.value ?? "1", 10);
    const dv = parts.find(p => p.type === "day")?.value;
    const dayMatch = dv === String(d!).padStart(2, "0");
    if (h === 0 && min === 0 && dayMatch) return t;
  }
  return guess; // fallback
}

/* ── Day label ── */
const WD_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: TZ });
const DY_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: TZ });
function dayLabel(iso: string): { wd: string; day: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, (m! - 1), d!, 12));
  return {
    wd: WD_FMT.format(dt).replace(/\.$/, "").toUpperCase(),
    day: DY_FMT.format(dt),
  };
}

/* ── Component ── */

export function EditionPeriodFrise({
  publishRouteIso,
  unifiedDayNav = null,
  windowStartIso,
  windowEndIso,
  className = "",
}: EditionPeriodFriseProps) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const aid = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  /* ── Build the list of 7 iso dates ── */
  const isos = useMemo(
    () => Array.from({ length: TOTAL_DAYS }, (_, i) => shiftIsoDate(publishRouteIso, i - DAY_RADIUS)),
    [publishRouteIso],
  );

  /* ── Fetch editions for all 7 days in parallel ── */
  const editionResults = useQueries({
    queries: isos.map((iso) => ({
      queryKey: ["edition", iso] as const,
      queryFn: (): Promise<Edition> => api.editionByDate(iso),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  /* ── Build edition windows map ── */
  const editionWindows = useMemo(() => {
    const m = new Map<string, { ws: number; we: number }>();
    isos.forEach((iso, i) => {
      const data = editionResults[i]?.data;
      if (data?.window_start && data?.window_end) {
        const ws = Date.parse(data.window_start);
        const we = Date.parse(data.window_end);
        if (Number.isFinite(ws) && Number.isFinite(we)) {
          m.set(iso, { ws, we });
        }
      }
    });
    // Fallback for center day from props
    if (!m.has(publishRouteIso) && windowStartIso && windowEndIso) {
      const ws = Date.parse(windowStartIso);
      const we = Date.parse(windowEndIso);
      if (Number.isFinite(ws) && Number.isFinite(we)) {
        m.set(publishRouteIso, { ws, we });
      }
    }
    return m;
  }, [editionResults, isos, publishRouteIso, windowStartIso, windowEndIso]);

  /* ── Now indicator: update every 30s ── */
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  /* ── Scroll to center active day on mount + when publishRouteIso changes ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Each day column = 1/DAYS_VISIBLE of container width
    const colW = el.clientWidth / DAYS_VISIBLE;
    // Active day is at index DAY_RADIUS (center). To center it → scroll to (DAY_RADIUS - 1) * colW
    const targetScroll = (DAY_RADIUS - 1) * colW;
    el.scrollTo({ left: targetScroll, behavior: "instant" });
  }, [publishRouteIso]);

  /* ── Href builder per mode ── */
  const dayHref = useCallback(
    (iso: string) => {
      const mode = unifiedDayNav?.mode ?? "edition";
      if (mode === "edition") return `/edition/${iso}`;
      if (mode === "panorama") return buildPanoramaDayHref(pathname, sp, iso);
      const qs = mergeArticlesQuery(sp, { date: iso, date_from: null, date_to: null });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [unifiedDayNav, pathname, sp],
  );

  /* ── Calendar onDateSelect ── */
  const calendarSelect = useCallback(
    (iso: string) => {
      const mode = unifiedDayNav?.mode ?? "edition";
      if (mode === "edition") window.location.href = `/edition/${iso}`;
      else if (mode === "panorama") window.location.href = buildPanoramaDayHref(pathname, sp, iso);
      else {
        const qs = mergeArticlesQuery(sp, { date: iso, date_from: null, date_to: null });
        window.location.href = qs ? `${pathname}?${qs}` : pathname;
      }
    },
    [unifiedDayNav, pathname, sp],
  );

  return (
    <div className={`relative w-full ${className}`.trim()} role="region" aria-describedby={aid}>
      {/* ── Top row: calendar icon ── */}
      <div className="mb-1.5 flex items-center justify-end">
        <EditionCalendarPopover
          currentIso={publishRouteIso}
          compact
          onDateSelect={calendarSelect}
        />
      </div>

      {/* ── Scrollable timeline ── */}
      <div
        ref={scrollRef}
        className="olj-scrollbar-none w-full overflow-x-auto"
        style={{ scrollSnapType: "x mandatory", scrollBehavior: "auto" }}
        role="list"
        aria-label="Timeline des éditions"
      >
        <div
          className="flex"
          style={{ width: `${(TOTAL_DAYS / DAYS_VISIBLE) * 100}%` }}
        >
          {isos.map((iso, idx) => {
            const isActive = iso === publishRouteIso;
            const isToday = iso === todayIso();
            const win = editionWindows.get(iso) ?? null;
            const dayMidnight = beirutMidnightMs(iso);
            const bands = win ? bandsForDay(dayMidnight, win.ws, win.we) : [];

            // Now indicator within this day column
            const nowPctInDay = (() => {
              if (!isToday) return null;
              const pct = ((nowMs - dayMidnight) / (24 * H)) * 100;
              if (pct < 0 || pct > 100) return null;
              return pct;
            })();

            const { wd, day: dayNum } = dayLabel(iso);

            return (
              <div
                key={iso}
                role="listitem"
                style={{
                  width: `${100 / TOTAL_DAYS}%`,
                  minWidth: `${100 / TOTAL_DAYS}%`,
                  scrollSnapAlign: "start",
                }}
              >
                <Link
                  href={dayHref(iso)}
                  scroll={false}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Édition du ${iso}${isToday ? " (aujourd'hui)" : ""}`}
                  className="group block w-full"
                  prefetch={Math.abs(idx - DAY_RADIUS) <= 1}
                >
                  {/* Day column: tick bar */}
                  <div
                    className="relative mx-px"
                    style={{
                      height: "48px",
                      background: isActive
                        ? "color-mix(in srgb, var(--color-accent) 4%, transparent)"
                        : "transparent",
                      borderRadius: "4px",
                      transition: "background 200ms ease",
                    }}
                  >
                    {/* Base track line */}
                    <div
                      aria-hidden
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: "50%",
                        height: "1px",
                        transform: "translateY(-50%)",
                        background: isActive
                          ? "color-mix(in srgb, var(--color-foreground) 14%, transparent)"
                          : "color-mix(in srgb, var(--color-foreground) 7%, transparent)",
                      }}
                    />

                    {/* Edition window + actualisation bands */}
                    {bands.map((b) => (
                      <div
                        key={b.label}
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: `${b.startPct}%`,
                          width: `${b.widthPct}%`,
                          top: "30%",
                          height: "40%",
                          background: b.color,
                          opacity: 0.11,
                          borderRadius: "2px",
                        }}
                      />
                    ))}

                    {/* Hour ticks */}
                    {DAY_TICKS.map((tk) => {
                      const h = TICK_H[tk.kind];
                      const w = TICK_W[tk.kind];
                      const op = tickOpacity(tk.kind);
                      return (
                        <div
                          key={tk.h}
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: `${tk.pctInDay}%`,
                            top: "50%",
                            transform: "translate(-50%, -50%)",
                            width: `${w}px`,
                            height: `${h}px`,
                            background: isActive
                              ? `color-mix(in srgb, var(--color-foreground) ${Math.round(op * 160)}%, transparent)`
                              : `color-mix(in srgb, var(--color-foreground) ${Math.round(op * 100)}%, transparent)`,
                            borderRadius: "1px",
                          }}
                        />
                      );
                    })}

                    {/* Hour labels: only show 0h, 6h, 12h, 18h */}
                    {DAY_TICKS.filter(tk => tk.kind === "midnight" || tk.kind === "major").map((tk) => (
                      <span
                        key={`lbl-${tk.h}`}
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: `${tk.pctInDay}%`,
                          top: "4px",
                          transform: "translateX(-50%)",
                          fontSize: "6px",
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: tk.kind === "midnight" ? 600 : 400,
                          color: isActive
                            ? `color-mix(in srgb, var(--color-foreground) ${tk.kind === "midnight" ? 45 : 25}%, transparent)`
                            : `color-mix(in srgb, var(--color-muted-foreground) ${tk.kind === "midnight" ? 35 : 20}%, transparent)`,
                          letterSpacing: "0.02em",
                          userSelect: "none",
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tk.h}h
                      </span>
                    ))}

                    {/* LIVE: now indicator */}
                    {nowPctInDay != null && (
                      <div
                        aria-label="Maintenant"
                        style={{
                          position: "absolute",
                          left: `${nowPctInDay}%`,
                          top: 0,
                          bottom: 0,
                          width: 0,
                          zIndex: 4,
                          pointerEvents: "none",
                        }}
                      >
                        {/* Vertical line */}
                        <div
                          style={{
                            position: "absolute",
                            left: "-0.75px",
                            top: "4px",
                            bottom: "4px",
                            width: "1.5px",
                            background: "var(--color-accent)",
                            opacity: 0.9,
                            borderRadius: "1px",
                          }}
                        />
                        {/* Dot */}
                        <div
                          style={{
                            position: "absolute",
                            left: "-5px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: "var(--color-accent)",
                            boxShadow: "0 0 0 2.5px rgba(255,255,255,.95), 0 0 10px rgba(221,59,49,.3)",
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Day label below bar */}
                  <div
                    className="flex flex-col items-center pt-1.5"
                    style={{ gap: "1px" }}
                  >
                    <span
                      style={{
                        fontSize: "6.5px",
                        fontWeight: isActive ? 700 : 400,
                        letterSpacing: "0.1em",
                        color: isActive
                          ? "var(--color-accent)"
                          : "color-mix(in srgb, var(--color-muted-foreground) 55%, transparent)",
                        transition: "color 200ms ease",
                        lineHeight: 1,
                        userSelect: "none",
                      }}
                    >
                      {wd}
                    </span>
                    <span
                      style={{
                        fontSize: isActive ? "14px" : "12px",
                        fontWeight: isActive ? 700 : 400,
                        color: isActive
                          ? "var(--color-foreground)"
                          : "color-mix(in srgb, var(--color-muted-foreground) 60%, transparent)",
                        tabularNums: "true",
                        lineHeight: 1,
                        transition: "font-size 160ms ease, color 200ms ease",
                        userSelect: "none",
                      } as React.CSSProperties}
                    >
                      {dayNum}
                    </span>
                    {/* LIVE label for today */}
                    {isToday && (
                      <span
                        style={{
                          fontSize: "5.5px",
                          fontWeight: 700,
                          letterSpacing: "0.18em",
                          color: isActive
                            ? "var(--color-accent)"
                            : "color-mix(in srgb, var(--color-accent) 50%, transparent)",
                          lineHeight: 1,
                          userSelect: "none",
                          textTransform: "uppercase",
                        }}
                      >
                        live
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Legend strip ── */}
      <div
        className="mt-2 flex items-center gap-3"
        aria-hidden
        style={{ paddingLeft: "2px" }}
      >
        <span className="flex items-center gap-1">
          <span
            style={{
              display: "inline-block",
              width: "14px",
              height: "3px",
              borderRadius: "2px",
              background: "var(--color-accent)",
              opacity: 0.5,
            }}
          />
          <span
            style={{
              fontSize: "8px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "color-mix(in srgb, var(--color-muted-foreground) 70%, transparent)",
              textTransform: "uppercase",
            }}
          >
            Collecte
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span
            style={{
              display: "inline-block",
              width: "14px",
              height: "3px",
              borderRadius: "2px",
              background: "#f59e0b",
              opacity: 0.5,
            }}
          />
          <span
            style={{
              fontSize: "8px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "color-mix(in srgb, var(--color-muted-foreground) 70%, transparent)",
              textTransform: "uppercase",
            }}
          >
            Actualisation
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--color-accent)",
              boxShadow: "0 0 0 2px rgba(255,255,255,.9)",
            }}
          />
          <span
            style={{
              fontSize: "8px",
              fontWeight: 500,
              letterSpacing: "0.08em",
              color: "color-mix(in srgb, var(--color-accent) 80%, transparent)",
              textTransform: "uppercase",
            }}
          >
            Live
          </span>
        </span>
      </div>

      <span id={aid} className="sr-only">
        Timeline édition, {TOTAL_DAYS} jours autour de {publishRouteIso}
      </span>
    </div>
  );
}
