"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";

/** Jours avant / après la date courante (bande scrollable). */
const RADIUS = 5;

function chipLabels(iso: string): { weekday: string; dayMonth: string } {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: "UTC",
  }).format(dt);
  const dayMonth = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(dt);
  return {
    weekday: weekday.replace(/\.$/, ""),
    dayMonth,
  };
}

/** Fenêtre éditoriale projetée sur la plage de jours visible (même axe que la frise). */
function windowVisibleFractions(
  windowStartIso: string,
  windowEndIso: string,
  visibleFirstIso: string,
  visibleLastIso: string,
): { leftPct: number; widthPct: number } | null {
  const ws = new Date(windowStartIso).getTime();
  const we = new Date(windowEndIso).getTime();
  const vs = new Date(`${visibleFirstIso}T00:00:00.000Z`).getTime();
  const ve =
    new Date(`${visibleLastIso}T00:00:00.000Z`).getTime() +
    24 * 3600 * 1000;
  if (!Number.isFinite(ws) || !Number.isFinite(we) || we <= ws) {
    return null;
  }
  if (ve <= vs) {
    return null;
  }
  const overlapStart = Math.max(ws, vs);
  const overlapEnd = Math.min(we, ve);
  if (overlapEnd <= overlapStart) {
    return null;
  }
  const leftPct = ((overlapStart - vs) / (ve - vs)) * 100;
  const widthPct = ((overlapEnd - overlapStart) / (ve - vs)) * 100;
  return {
    leftPct: Math.max(0, Math.min(100, leftPct)),
    widthPct: Math.max(0.6, Math.min(100, widthPct)),
  };
}

function formatWindowEdgeBeirut(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Beirut",
  })
    .format(new Date(iso))
    .replace(/\.$/, "");
}

export type EditionDateRailWindow = { start: string; end: string };

export type EditionDateRailProps = {
  currentIso: string;
  className?: string;
  editionWindow?: EditionDateRailWindow | null;
};

export function EditionDateRail({
  currentIso,
  className = "",
  editionWindow = null,
}: EditionDateRailProps) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -RADIUS; i <= RADIUS; i++) {
      out.push(shiftIsoDate(currentIso, i));
    }
    return out;
  }, [currentIso]);

  const windowOnStrip = useMemo(() => {
    if (!editionWindow?.start || !editionWindow?.end || days.length === 0) {
      return null;
    }
    const first = days[0];
    const last = days[days.length - 1];
    if (!first || !last) {
      return null;
    }
    return windowVisibleFractions(
      editionWindow.start,
      editionWindow.end,
      first,
      last,
    );
  }, [editionWindow, days]);

  const startLabel = editionWindow?.start
    ? formatWindowEdgeBeirut(editionWindow.start)
    : null;
  const endLabel = editionWindow?.end
    ? formatWindowEdgeBeirut(editionWindow.end)
    : null;

  const editionWindowRange = useMemo(() => {
    if (!editionWindow) {
      return null;
    }
    const ws = new Date(editionWindow.start).getTime();
    const we = new Date(editionWindow.end).getTime();
    if (!Number.isFinite(ws) || !Number.isFinite(we)) {
      return null;
    }
    return { ws, we };
  }, [editionWindow]);

  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanLeft(scrollLeft > 2);
    setCanRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
    const t = window.setTimeout(updateScrollArrows, 400);
    return () => window.clearTimeout(t);
  }, [currentIso, updateScrollArrows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    updateScrollArrows();
    el.addEventListener("scroll", updateScrollArrows, { passive: true });
    const ro = new ResizeObserver(updateScrollArrows);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollArrows);
      ro.disconnect();
    };
  }, [updateScrollArrows, days.length]);

  const scrollChunkPx = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return 220;
    }
    const li = el.querySelector("li");
    const w = li ? li.getBoundingClientRect().width + 8 : 76;
    return Math.round(w * 3);
  }, []);

  const scrollPrev = useCallback(() => {
    scrollRef.current?.scrollBy({
      left: -scrollChunkPx(),
      behavior: "smooth",
    });
  }, [scrollChunkPx]);

  const scrollNext = useCallback(() => {
    scrollRef.current?.scrollBy({
      left: scrollChunkPx(),
      behavior: "smooth",
    });
  }, [scrollChunkPx]);

  return (
    <div
      className={`olj-date-rail flex w-full max-w-full flex-col gap-0 ${className}`.trim()}
      aria-label="Choisir une date d’édition"
    >
      <div className="rounded-xl border border-border/35 bg-muted/15 p-2 sm:p-2.5">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-1 sm:flex-nowrap sm:gap-0">
          <button
            type="button"
            className="olj-date-rail__chevron"
            aria-label="Faire défiler vers les jours précédents"
            disabled={!canLeft}
            onClick={scrollPrev}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          <div className="olj-date-rail__viewport min-h-0 min-w-0 flex-1 basis-0">
            <ul
              ref={scrollRef}
              className="olj-date-rail__track m-0 flex list-none flex-row gap-1 overflow-x-auto scroll-smooth py-0.5 sm:gap-1.5"
            >
              {days.map((iso) => {
                const active = iso === currentIso;
                const { weekday, dayMonth } = chipLabels(iso);
                const dayStart = new Date(`${iso}T00:00:00.000Z`).getTime();
                const dayEnd = dayStart + 24 * 3600 * 1000;
                const inWindowBand = Boolean(
                  editionWindowRange &&
                    dayEnd > editionWindowRange.ws &&
                    dayStart < editionWindowRange.we,
                );
                return (
                  <li key={iso} className="inline-flex shrink-0 snap-center">
                    <Link
                      ref={active ? activeRef : undefined}
                      href={`/edition/${iso}`}
                      scroll={false}
                      aria-current={active ? "page" : undefined}
                      title={`Édition du ${iso}`}
                      className={`relative flex min-h-[3rem] min-w-[3.25rem] flex-col items-center justify-center overflow-hidden rounded-2xl px-2 py-2.5 text-center no-underline transition-[color,background,box-shadow,opacity] duration-200 touch-manipulation sm:min-h-0 sm:py-2 ${
                        active
                          ? "bg-card text-foreground shadow-[0_2px_12px_rgba(0,0,0,0.06)] ring-1 ring-border/40"
                          : inWindowBand
                            ? "bg-[color-mix(in_srgb,var(--color-accent)_6%,transparent)] text-foreground/75 hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-muted))] hover:text-foreground/90"
                            : "text-muted-foreground/45 hover:bg-muted/25 hover:text-foreground/65"
                      }`}
                    >
                      <span className="text-[9px] font-medium uppercase tracking-[0.08em]">
                        {weekday}
                      </span>
                      <span className="font-[family-name:var(--font-serif)] text-[13px] font-semibold tabular-nums leading-tight">
                        {dayMonth}
                      </span>
                      {active ? (
                        <span
                          className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--color-accent)]"
                          aria-hidden
                        />
                      ) : (
                        <span
                          className="mt-1 h-1 w-1 shrink-0 rounded-full bg-transparent"
                          aria-hidden
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
          <button
            type="button"
            className="olj-date-rail__chevron"
            aria-label="Faire défiler vers les jours suivants"
            disabled={!canRight}
            onClick={scrollNext}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          <EditionCalendarPopover currentIso={currentIso} />
        </div>

        {windowOnStrip && editionWindow && startLabel && endLabel ? (
          <div
            className="mt-3 border-t border-border/30 pt-2.5"
            role="group"
            aria-label="Plage horaire de collecte pour cette édition (Beyrouth)"
          >
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Fenêtre de collecte (Beyrouth)
            </p>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/55">
              <div
                className="absolute inset-y-0 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_38%,var(--color-muted))] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                style={{
                  left: `${windowOnStrip.leftPct}%`,
                  width: `${windowOnStrip.widthPct}%`,
                }}
              />
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-[10px] leading-tight text-muted-foreground">
              <span className="max-w-[48%] text-left font-medium text-foreground/85">
                {startLabel}
              </span>
              <span className="max-w-[48%] text-right font-medium text-foreground/85">
                {endLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
