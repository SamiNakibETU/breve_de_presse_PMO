"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { shiftIsoDate, todayBeirutIsoDate } from "@/lib/beirut-date";
import { chipLabelsEditionRail } from "@/lib/dates-display-fr";
import { UI_SURFACE_INSET, UI_SURFACE_INSET_PAD } from "@/lib/ui-surface-classes";

const RADIUS = 5;

export function mergeArticlesQuery(
  base: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): string {
  const p = new URLSearchParams(base.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") {
      p.delete(k);
    } else {
      p.set(k, v);
    }
  }
  const qs = p.toString();
  return qs;
}

export type ArticlesPeriodRailProps = {
  className?: string;
  /** Jour unique Beyrouth (YYYY-MM-DD) ou null si plage / glissant */
  beirutDate: string | null;
  beirutFrom: string | null;
  beirutTo: string | null;
};

/**
 * Frise de jours (même gabarit visuel que l’édition) pour la page Articles : navigation par jour,
 * calendrier popover, sans fenêtre d’édition.
 */
export function ArticlesPeriodRail({
  className = "",
  beirutDate,
  beirutFrom,
  beirutTo,
}: ArticlesPeriodRailProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const anchorIso = beirutDate ?? todayBeirutIsoDate();
  const rangeActive = Boolean(beirutFrom && beirutTo);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -RADIUS; i <= RADIUS; i++) {
      out.push(shiftIsoDate(anchorIso, i));
    }
    return out;
  }, [anchorIso]);

  const hrefForDay = useCallback(
    (iso: string) => {
      const qs = mergeArticlesQuery(searchParams, {
        date: iso,
        date_from: null,
        date_to: null,
      });
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, searchParams],
  );

  const updateScrollArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
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
  }, [anchorIso, updateScrollArrows]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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
    if (!el) return 220;
    const li = el.querySelector("a");
    const w = li ? li.getBoundingClientRect().width + 4 : 76;
    return Math.round(w * 3);
  }, []);

  const scrollPrev = useCallback(() => {
    scrollRef.current?.scrollBy({ left: -scrollChunkPx(), behavior: "smooth" });
  }, [scrollChunkPx]);

  const scrollNext = useCallback(() => {
    scrollRef.current?.scrollBy({ left: scrollChunkPx(), behavior: "smooth" });
  }, [scrollChunkPx]);

  const clearRange = useCallback(() => {
    const qs = mergeArticlesQuery(searchParams, {
      date_from: null,
      date_to: null,
    });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div
      className={`olj-date-rail flex w-full max-w-full flex-col items-center gap-0 sm:items-stretch ${className}`.trim()}
      aria-label="Choisir une période (articles)"
    >
      <div
        className={`w-full max-w-full ${UI_SURFACE_INSET} ${UI_SURFACE_INSET_PAD}`}
      >
        {rangeActive ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-border/25 pb-3 text-[11px] text-foreground-body">
            <span className="tabular-nums">
              Plage sélectionnée :{" "}
              <strong className="font-medium text-foreground">
                {beirutFrom} → {beirutTo}
              </strong>
            </span>
            <button
              type="button"
              className="text-accent underline underline-offset-2 hover:opacity-90"
              onClick={clearRange}
            >
              Effacer la plage
            </button>
          </div>
        ) : null}
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
                    const active = !rangeActive && Boolean(beirutDate) && iso === beirutDate;
                    const { weekday, dayMonth } = chipLabelsEditionRail(iso);
                    return (
                      <li
                        key={iso}
                        className="inline-flex shrink-0 snap-center snap-always"
                      >
                        <Link
                          ref={active ? activeRef : undefined}
                          href={hrefForDay(iso)}
                          scroll={false}
                          aria-current={active ? "page" : undefined}
                          aria-label={`Articles du jour ${iso}`}
                          className={`relative flex min-h-[3rem] min-w-[3rem] flex-col items-center justify-center rounded-md px-2.5 py-2 text-center no-underline transition-[color,background,box-shadow] duration-200 touch-manipulation sm:min-h-[2.85rem] sm:px-3 ${
                            active
                              ? "text-foreground ring-1 ring-[color-mix(in_srgb,var(--color-accent)_45%,transparent)] ring-offset-2 ring-offset-[color-mix(in_srgb,var(--color-muted)_70%,transparent)]"
                              : "text-muted-foreground/55 hover:bg-muted/25 hover:text-foreground/75"
                          }`}
                        >
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
          <EditionCalendarPopover
            currentIso={anchorIso}
            triggerLabel="Calendrier"
            onDateSelect={(iso) => {
              const qs = mergeArticlesQuery(searchParams, {
                date: iso,
                date_from: null,
                date_to: null,
              });
              router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
            }}
          />
        </div>
      </div>
    </div>
  );
}
