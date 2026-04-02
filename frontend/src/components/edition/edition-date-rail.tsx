"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shiftIsoDate } from "@/lib/beirut-date";

/** Jours avant / après la date courante (bande scrollable ; ~3 jours visibles selon largeur). */
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

type EditionDateRailProps = {
  currentIso: string;
  className?: string;
};

export function EditionDateRail({
  currentIso,
  className = "",
}: EditionDateRailProps) {
  const router = useRouter();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const scrollRef = useRef<HTMLUListElement>(null);
  const hiddenPickerRef = useRef<HTMLInputElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -RADIUS; i <= RADIUS; i++) {
      out.push(shiftIsoDate(currentIso, i));
    }
    return out;
  }, [currentIso]);

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
    const w = li ? li.getBoundingClientRect().width + 4 : 72;
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

  const openNativePicker = () => {
    const el = hiddenPickerRef.current;
    if (!el) {
      return;
    }
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        /* repli */
      }
    }
    el.click();
  };

  const chipBase =
    "flex min-w-[3.35rem] shrink-0 snap-center flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center transition-colors duration-150 touch-manipulation no-underline";

  return (
    <div
      className={`flex min-w-0 max-w-full items-stretch gap-1 ${className}`.trim()}
      aria-label="Choisir une date d’édition"
    >
      <button
        type="button"
        className="olj-date-rail__chevron"
        aria-label="Faire défiler vers les jours précédents"
        disabled={!canLeft}
        onClick={scrollPrev}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <ul
        ref={scrollRef}
        className="olj-date-rail__track m-0 flex w-full min-w-0 max-w-[min(100%,14rem)] list-none flex-row gap-1 overflow-x-auto scroll-smooth py-0.5 sm:max-w-[min(100%,15rem)]"
      >
        {days.map((iso) => {
          const active = iso === currentIso;
          const { weekday, dayMonth } = chipLabels(iso);
          return (
            <li key={iso} className="inline-flex shrink-0 snap-center">
              <Link
                ref={active ? activeRef : undefined}
                href={`/edition/${iso}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
                title={`Édition du ${iso}`}
                className={`${chipBase} ${
                  active
                    ? "border-accent bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-foreground shadow-[inset_0_0_0_1px_rgba(221,59,49,0.28)]"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                }`}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide opacity-85">
                  {weekday}
                </span>
                <span className="font-[family-name:var(--font-serif)] text-[12px] font-semibold tabular-nums leading-tight">
                  {dayMonth}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="olj-date-rail__chevron"
        aria-label="Faire défiler vers les jours suivants"
        disabled={!canRight}
        onClick={scrollNext}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex shrink-0 flex-col items-stretch">
        <button
          type="button"
          onClick={openNativePicker}
          className={`${chipBase} h-full min-h-[2.65rem] border-dashed border-border bg-background text-muted-foreground hover:border-accent/50 hover:text-accent`}
          title="Ouvrir le sélecteur de date du navigateur"
          aria-label="Choisir une autre date dans le calendrier"
        >
          <Calendar className="mx-auto h-3.5 w-3.5 opacity-90" aria-hidden />
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide">
            Autre
          </span>
        </button>
        <input
          ref={hiddenPickerRef}
          type="date"
          value={currentIso}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (v) {
              router.push(`/edition/${v}`);
            }
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
