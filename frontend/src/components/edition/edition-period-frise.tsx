"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useId, useMemo } from "react";
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
  /** Hide start/end labels — used when parent already displays them. */
  compact?: boolean;
};

type Tick = { pct: number; h: number; midnight: boolean };
type DayPill = { iso: string; lbl: string; active: boolean };

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

  const data = useMemo(() => {
    const ws = Date.parse(windowStartIso);
    const we = Date.parse(windowEndIso);
    if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) return null;
    const span = we - ws;

    // 6-hour ticks within window
    const ticks: Tick[] = [];
    let t = Math.ceil(ws / H) * H;
    while (t < we) {
      const hour = bh(t);
      if (hour % 6 === 0) {
        ticks.push({
          pct: ((t - ws) / span) * 100,
          h: hour,
          midnight: hour === 0,
        });
      }
      t += H;
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
      className={`w-full ${className}`.trim()}
      role="region"
      aria-describedby={aid}
    >
      {/* ── Time labels ── */}
      {!compact && (
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="font-mono text-[10px] tabular-nums leading-none text-muted-foreground">
              {data.st}
            </p>
            <p
              className="mt-0.5 font-mono uppercase text-muted-foreground/40"
              style={{ fontSize: "7px", letterSpacing: "0.15em" }}
            >
              {data.sd}
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[10px] tabular-nums leading-none text-muted-foreground">
              {data.et}
            </p>
            <p
              className="mt-0.5 font-mono uppercase text-muted-foreground/40"
              style={{ fontSize: "7px", letterSpacing: "0.15em" }}
            >
              {data.ed}
            </p>
          </div>
        </div>
      )}

      {/* ── Bar ── */}
      <div
        className="relative h-[3px] w-full rounded-full"
        style={{
          background:
            "color-mix(in srgb, var(--color-border) 30%, transparent)",
        }}
      >
        {/* 6h ticks */}
        {data.ticks.map((tk) => (
          <div
            key={`${tk.h}-${tk.pct}`}
            aria-hidden
            style={{
              position: "absolute",
              left: `${tk.pct}%`,
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: tk.midnight ? "1.5px" : "1px",
              height: tk.midnight ? "12px" : "5px",
              borderRadius: "1px",
              background: tk.midnight
                ? "var(--color-foreground)"
                : "color-mix(in srgb, var(--color-foreground) 16%, transparent)",
            }}
          />
        ))}

        {/* Now dot (only if today and within window) */}
        {data.nowPct != null && (
          <div
            aria-label="Heure actuelle"
            style={{
              position: "absolute",
              left: `${data.nowPct}%`,
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--color-accent)",
              boxShadow:
                "0 0 0 2px rgba(255,255,255,.95), 0 1px 4px rgba(221,59,49,.3)",
              zIndex: 2,
            }}
          />
        )}
      </div>

      {/* ── Hour labels ── */}
      <div className="relative mt-1 h-2.5 w-full" aria-hidden>
        {data.ticks.map((tk) => (
          <span
            key={`l-${tk.pct}`}
            className="absolute top-0 -translate-x-1/2 select-none font-mono tabular-nums leading-none"
            style={{
              left: `${tk.pct}%`,
              fontSize: "6.5px",
              fontWeight: tk.midnight ? 500 : 400,
              color: tk.midnight
                ? "color-mix(in srgb, var(--color-foreground) 55%, transparent)"
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

      <span id={aid} className="sr-only">
        {data.sd} {data.st} → {data.ed} {data.et}
      </span>
    </div>
  );
}
