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
import { EditionWindowTimeline } from "@/components/edition/edition-window-timeline";

/** Jours avant / après la date courante (bande scrollable). */
const RADIUS = 5;

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
      <div className="w-full max-w-full rounded-xl border border-border/35 bg-muted/15 p-3 sm:p-3.5">
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
                <ul className="relative z-[1] m-0 flex list-none flex-row items-stretch gap-0 px-0.5 py-1">
                  {days.map((iso) => {
                    const active = iso === currentIso;
                    const { weekday, dayMonth } = chipLabelsEditionRail(iso);
                    const dayHeading = formatEditionDayHeadingFr(iso);
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
                          aria-label={`Édition ${dayHeading}`}
                          className={`relative flex min-h-[3rem] min-w-[3rem] flex-col items-center justify-center rounded-md px-2.5 py-2 text-center no-underline transition-[color,background,box-shadow] duration-200 touch-manipulation sm:min-h-[2.85rem] sm:px-3 ${
                            active
                              ? "text-foreground ring-1 ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] ring-offset-2 ring-offset-[color-mix(in_srgb,var(--color-muted)_70%,transparent)]"
                              : inWindowBand
                                ? "text-foreground/85 hover:bg-muted/40 hover:text-foreground"
                                : "text-muted-foreground/55 hover:bg-muted/25 hover:text-foreground/75"
                          }`}
                        >
                          {inWindowBand && !active ? (
                            <span
                              className="pointer-events-none absolute inset-x-1 bottom-1 h-0.5 rounded-full bg-[color-mix(in_srgb,var(--color-accent)_35%,transparent)]"
                              aria-hidden
                            />
                          ) : null}
                          <span className="text-[9px] font-medium uppercase tracking-[0.08em]">
                            {weekday}
                          </span>
                          <span className="font-[family-name:var(--font-serif)] text-[14px] font-semibold tabular-nums leading-tight sm:text-[15px]">
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

        {editionWindow?.start &&
        editionWindow?.end &&
        startLabel &&
        endLabel ? (
          <div
            className="mt-4 border-t border-border/25 pt-3"
            role="group"
            aria-label="Fenêtre de collecte et axe horaire (Beyrouth)"
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[11px] tabular-nums text-muted-foreground">
              <span className="text-foreground/85">{startLabel}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Fenêtre de collecte
              </span>
              <span className="text-foreground/85">{endLabel}</span>
            </div>
            <div className="pb-5">
              <EditionWindowTimeline
                windowStartIso={editionWindow.start}
                windowEndIso={editionWindow.end}
                publishRouteIso={currentIso}
                variant="default"
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
