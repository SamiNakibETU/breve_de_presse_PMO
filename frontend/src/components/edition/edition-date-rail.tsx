"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  chipLabelsEditionRail,
  formatEditionDayHeadingFr,
  formatWindowEdgeBeirut,
} from "@/lib/dates-display-fr";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";

/** Jours avant / après la date courante (bande scrollable). */
const RADIUS = 5;

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
  const scrollRef = useRef<HTMLDivElement>(null);
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
    const li = el.querySelector("a");
    const w = li ? li.getBoundingClientRect().width + 4 : 76;
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
      className={`olj-date-rail flex w-full max-w-full flex-col items-center gap-0 sm:items-stretch ${className}`.trim()}
      aria-label="Choisir une date d’édition"
    >
      <div className="w-full max-w-full rounded-xl border border-border/35 bg-muted/15 p-2 sm:p-2.5">
        <div className="flex w-full min-w-0 items-center justify-center gap-0.5 sm:gap-1">
          <button
            type="button"
            className="olj-date-rail__chevron shrink-0"
            aria-label="Faire défiler vers les jours précédents"
            disabled={!canLeft}
            onClick={scrollPrev}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
          <div className="min-h-0 min-w-0 flex-1">
            <div
              ref={scrollRef}
              className="olj-date-rail__viewport overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <div className="relative mx-auto flex min-w-max flex-row justify-center sm:mx-0 sm:justify-start">
                {windowOnStrip ? (
                  <div
                    className="pointer-events-none absolute inset-y-1 z-0 rounded-md bg-[color-mix(in_srgb,var(--color-accent-tint)_55%,var(--color-surface-warm)_45%)] opacity-95 ring-1 ring-[color-mix(in_srgb,var(--color-accent)_18%,transparent)]"
                    style={{
                      left: `${windowOnStrip.leftPct}%`,
                      width: `${windowOnStrip.widthPct}%`,
                    }}
                    aria-hidden
                  />
                ) : null}
                <ul className="relative z-[1] m-0 flex list-none flex-row items-stretch gap-0 px-0.5 py-1">
                  {days.map((iso) => {
                    const active = iso === currentIso;
                    const { weekday, dayMonth } = chipLabelsEditionRail(iso);
                    const dayTitle = formatEditionDayHeadingFr(iso);
                    const dayStart = new Date(`${iso}T00:00:00.000Z`).getTime();
                    const dayEnd = dayStart + 24 * 3600 * 1000;
                    const inWindowBand = Boolean(
                      editionWindowRange &&
                        dayEnd > editionWindowRange.ws &&
                        dayStart < editionWindowRange.we,
                    );
                    return (
                      <li
                        key={iso}
                        className="inline-flex shrink-0 snap-center snap-always"
                      >
                        <Link
                          ref={active ? activeRef : undefined}
                          href={`/edition/${iso}`}
                          scroll={false}
                          aria-current={active ? "page" : undefined}
                          title={`Édition — ${dayTitle}`}
                          className={`relative flex min-h-[2.75rem] min-w-[2.75rem] flex-col items-center justify-center px-2.5 py-2 text-center no-underline transition-[color,opacity] duration-200 touch-manipulation sm:min-h-[2.5rem] sm:px-3 ${
                            active
                              ? "text-foreground"
                              : inWindowBand
                                ? "text-foreground/80 hover:text-foreground"
                                : "text-muted-foreground/55 hover:text-foreground/70"
                          }`}
                        >
                          <span className="text-[9px] font-medium uppercase tracking-[0.08em]">
                            {weekday}
                          </span>
                          <span className="font-[family-name:var(--font-serif)] text-[13px] font-semibold tabular-nums leading-tight">
                            {dayMonth}
                          </span>
                          <span
                            className="mt-1 flex h-1 w-1 shrink-0 items-center justify-center"
                            aria-hidden
                          >
                            <span
                              className={
                                active
                                  ? "h-1 w-1 rounded-full bg-[var(--color-accent)]"
                                  : "h-1 w-1 rounded-full bg-transparent"
                              }
                            />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="olj-date-rail__chevron shrink-0"
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
            className="mt-2 border-t border-border/25 pt-2 text-center sm:text-left"
            role="group"
            aria-label="Plage horaire de collecte pour cette édition (Beyrouth)"
          >
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Fenêtre de collecte (Beyrouth)
            </p>
            <div className="mt-0.5 flex flex-wrap justify-center gap-x-4 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground sm:justify-between">
              <span className="text-foreground/80">{startLabel}</span>
              <span className="text-foreground/80">{endLabel}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
