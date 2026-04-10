"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo, useRef, useEffect } from "react";
import {
  buildPanoramaDayHref,
  mergeArticlesQuery,
} from "@/lib/articles-url-query";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  formatFriseBoundaryTimeFr,
  formatFriseEdgeDayFr,
} from "@/lib/dates-display-fr";

const TZ = "Asia/Beirut";
const H = 3_600_000;

const BH = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  hour12: false,
});

function bh(ms: number): number {
  return parseInt(BH.format(ms), 10) % 24;
}

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/* ─── Types ─── */

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
  compact?: boolean;
};

type Tick = {
  pct: number;
  h: number;
  midnight: boolean;
  major: boolean;
  minor: boolean;
};

type PeriodZone = {
  startPct: number;
  endPct: number;
  label: string;
  color: string;
};

type DayPill = { iso: string; lbl: string; active: boolean };

/* ─── Tick height hierarchy ─── */
function tickHeight(t: Tick): number {
  if (t.midnight) return 20;
  if (t.major) return 12;
  if (t.minor) return 7;
  return 3;
}

function tickWidth(t: Tick): number {
  if (t.midnight) return 1.5;
  if (t.major) return 1;
  return 0.5;
}

function tickOpacity(t: Tick): number {
  if (t.midnight) return 0.7;
  if (t.major) return 0.35;
  if (t.minor) return 0.18;
  return 0.08;
}

/* ─── Component ─── */

export function EditionPeriodFrise({
  windowStartIso,
  windowEndIso,
  publishRouteIso,
  className = "",
  unifiedDayNav = null,
  compact = false,
}: EditionPeriodFriseProps) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const aid = useId();
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = nowRef.current;
    if (!el) return;
    el.style.animation = "none";
    void el.offsetHeight;
    el.style.animation = "";
  }, [publishRouteIso]);

  const data = useMemo(() => {
    const ws = Date.parse(windowStartIso);
    const we = Date.parse(windowEndIso);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return null;
    const span = we - ws;

    // 1-hour ticks within window → hierarchical
    const ticks: Tick[] = [];
    let t = Math.ceil(ws / H) * H;
    while (t < we) {
      const hour = bh(t);
      ticks.push({
        pct: ((t - ws) / span) * 100,
        h: hour,
        midnight: hour === 0,
        major: hour % 6 === 0 && hour !== 0,
        minor: hour % 3 === 0 && hour % 6 !== 0,
      });
      t += H;
    }

    // Pipeline periods: collecte 9h Paris → ~11h Beirut, actualisation 16h Paris → ~18h Beirut
    // Collection window in Beirut = ws to approximately 11h of the publish day
    // Actualisation = approximately 18h to we
    const zones: PeriodZone[] = [];
    const wsBeirutH = bh(ws);
    const weBeirutH = bh(we);

    // Find collect morning end (~11h-12h Beirut) and actualisation start (~18h Beirut)
    // Collecte: ws → 12h Beirut on the edition day
    let collectEnd = ws;
    let actualStart = we;
    let tt = Math.ceil(ws / H) * H;
    while (tt < we) {
      const hour = bh(tt);
      if (hour === 12 && collectEnd === ws) {
        collectEnd = tt;
      }
      if (hour === 18 && tt > ws + 6 * H) {
        actualStart = tt;
      }
      tt += H;
    }

    if (collectEnd > ws) {
      zones.push({
        startPct: 0,
        endPct: ((collectEnd - ws) / span) * 100,
        label: "Collecte",
        color: "var(--color-accent)",
      });
    }

    if (actualStart < we) {
      zones.push({
        startPct: ((actualStart - ws) / span) * 100,
        endPct: 100,
        label: "Actualisation",
        color: "color-mix(in srgb, #f59e0b 80%, transparent)",
      });
    }

    // Now indicator
    const now = Date.now();
    const isToday = publishRouteIso === todayIso();
    const nowPct =
      isToday && now >= ws && now <= we
        ? ((now - ws) / span) * 100
        : null;

    // Day pills for navigation
    const pills: DayPill[] = [];
    if (unifiedDayNav) {
      const r = unifiedDayNav.dayRadius ?? 5;
      for (let i = -r; i <= r; i++) {
        const iso = shiftIsoDate(publishRouteIso, i);
        const [y, mo, dd] = iso.split("-").map(Number);
        const utc = Date.UTC(y!, (mo! - 1), dd!, 12);
        const wd = new Intl.DateTimeFormat("fr-FR", {
          weekday: "narrow",
          timeZone: TZ,
        }).format(utc);
        const day = new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          timeZone: TZ,
        }).format(utc);
        pills.push({
          iso,
          lbl: `${wd} ${day}`,
          active: iso === publishRouteIso,
        });
      }
    }

    return {
      ticks,
      zones,
      nowPct,
      isToday,
      pills,
      st: formatFriseBoundaryTimeFr(windowStartIso),
      sd: formatFriseEdgeDayFr(windowStartIso),
      et: formatFriseBoundaryTimeFr(windowEndIso),
      ed: formatFriseEdgeDayFr(windowEndIso),
    };
  }, [windowStartIso, windowEndIso, publishRouteIso, unifiedDayNav]);

  const dayHref = useCallback(
    (iso: string) => {
      if (!unifiedDayNav) return "#";
      if (unifiedDayNav.mode === "edition") return `/edition/${iso}`;
      if (unifiedDayNav.mode === "panorama")
        return buildPanoramaDayHref(pathname, sp, iso);
      const qs = mergeArticlesQuery(sp, {
        date: iso,
        date_from: null,
        date_to: null,
      });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [unifiedDayNav, pathname, sp],
  );

  if (!data) return null;

  return (
    <div
      className={`w-full select-none ${className}`.trim()}
      role="region"
      aria-describedby={aid}
    >
      {/* ── Time boundary labels ── */}
      {!compact && (
        <div className="mb-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-mono tabular-nums leading-none text-foreground/70"
              style={{ fontSize: "11px", fontWeight: 500 }}
            >
              {data.st}
            </span>
            <span
              className="font-mono uppercase leading-none text-muted-foreground/40"
              style={{ fontSize: "7.5px", letterSpacing: "0.12em" }}
            >
              {data.sd}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-mono uppercase leading-none text-muted-foreground/40"
              style={{ fontSize: "7.5px", letterSpacing: "0.12em" }}
            >
              {data.ed}
            </span>
            <span
              className="font-mono tabular-nums leading-none text-foreground/70"
              style={{ fontSize: "11px", fontWeight: 500 }}
            >
              {data.et}
            </span>
          </div>
        </div>
      )}

      {/* ── Period zone labels (above bar) ── */}
      {!compact && data.zones.length > 0 && (
        <div className="relative mb-1 h-3 w-full">
          {data.zones.map((z) => (
            <span
              key={z.label}
              className="absolute top-0 font-mono uppercase tracking-widest"
              style={{
                left: `${z.startPct}%`,
                fontSize: "6px",
                fontWeight: 600,
                letterSpacing: "0.15em",
                color: z.color,
                opacity: 0.7,
              }}
            >
              {z.label}
            </span>
          ))}
        </div>
      )}

      {/* ── Main barcode bar ── */}
      <div className="relative w-full" style={{ height: "28px" }}>
        {/* Base track */}
        <div
          className="absolute left-0 right-0 rounded-full"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            height: "1px",
            background: "color-mix(in srgb, var(--color-border) 40%, transparent)",
          }}
        />

        {/* Period zone bands */}
        {data.zones.map((z) => (
          <div
            key={z.label}
            className="absolute rounded-sm"
            style={{
              left: `${z.startPct}%`,
              width: `${z.endPct - z.startPct}%`,
              top: "50%",
              transform: "translateY(-50%)",
              height: "4px",
              background: z.color,
              opacity: 0.1,
            }}
          />
        ))}

        {/* Hierarchical ticks */}
        {data.ticks.map((tk) => {
          const h = tickHeight(tk);
          const w = tickWidth(tk);
          const op = tickOpacity(tk);
          return (
            <div
              key={`${tk.h}-${tk.pct.toFixed(4)}`}
              aria-hidden
              style={{
                position: "absolute",
                left: `${tk.pct}%`,
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: `${w}px`,
                height: `${h}px`,
                borderRadius: "1px",
                background: `var(--color-foreground)`,
                opacity: op,
                transition: "height 200ms ease, opacity 200ms ease",
              }}
            />
          );
        })}

        {/* Now indicator — red dot + line + LIVE label */}
        {data.nowPct != null && (
          <div
            ref={nowRef}
            style={{
              position: "absolute",
              left: `${data.nowPct}%`,
              top: 0,
              bottom: 0,
              width: 0,
              zIndex: 3,
            }}
          >
            {/* Vertical line */}
            <div
              style={{
                position: "absolute",
                left: "-0.5px",
                top: "2px",
                bottom: "2px",
                width: "1px",
                background: "var(--color-accent)",
                opacity: 0.6,
              }}
            />
            {/* Dot */}
            <div
              style={{
                position: "absolute",
                left: "-4px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--color-accent)",
                boxShadow:
                  "0 0 0 2px rgba(255,255,255,.95), 0 0 8px rgba(221,59,49,.25)",
              }}
            />
            {/* LIVE label */}
            <span
              className="font-mono font-bold uppercase tracking-widest"
              style={{
                position: "absolute",
                left: "-8px",
                bottom: "-13px",
                fontSize: "5.5px",
                color: "var(--color-accent)",
                letterSpacing: "0.15em",
                whiteSpace: "nowrap",
              }}
            >
              live
            </span>
          </div>
        )}
      </div>

      {/* ── Hour labels below bar ── */}
      <div className="relative mt-0.5 h-3 w-full" aria-hidden>
        {data.ticks
          .filter((tk) => tk.midnight || tk.major)
          .map((tk) => (
            <span
              key={`l-${tk.pct.toFixed(4)}`}
              className="absolute top-0 -translate-x-1/2 select-none font-mono tabular-nums leading-none"
              style={{
                left: `${tk.pct}%`,
                fontSize: tk.midnight ? "8px" : "7px",
                fontWeight: tk.midnight ? 600 : 400,
                color: tk.midnight
                  ? "color-mix(in srgb, var(--color-foreground) 50%, transparent)"
                  : "color-mix(in srgb, var(--color-muted-foreground) 30%, transparent)",
              }}
            >
              {tk.h}h
            </span>
          ))}
      </div>

      {/* ── Day pills (panorama / articles mode) ── */}
      {data.pills.length > 0 && (
        <nav
          aria-label="Jours"
          className="olj-scrollbar-none mt-2.5 flex gap-px overflow-x-auto"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {data.pills.map((p) => (
            <Link
              key={p.iso}
              href={dayHref(p.iso)}
              scroll={false}
              aria-current={p.active ? "page" : undefined}
              className="shrink-0 rounded px-1.5 py-0.5 font-mono tabular-nums transition-colors duration-100"
              style={{
                scrollSnapAlign: "center",
                fontSize: "8.5px",
                fontWeight: p.active ? 600 : 400,
                color: p.active
                  ? "var(--color-accent)"
                  : "color-mix(in srgb, var(--color-muted-foreground) 55%, transparent)",
                background: p.active
                  ? "color-mix(in srgb, var(--color-accent) 7%, transparent)"
                  : undefined,
              }}
            >
              {p.lbl}
            </Link>
          ))}
        </nav>
      )}

      {/* ── Compact period label ── */}
      {compact && (
        <p
          className="mt-1 text-center font-mono uppercase text-muted-foreground/30"
          style={{ fontSize: "6px", letterSpacing: "0.18em" }}
        >
          {data.sd} {data.st} → {data.ed} {data.et}
        </p>
      )}

      <span id={aid} className="sr-only">
        Période {data.sd} {data.st} → {data.ed} {data.et}
      </span>
    </div>
  );
}
