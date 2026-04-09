"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  formatEditionCalendarTitleFr,
  formatFriseBoundaryTimeFr,
  formatFriseEdgeDayFr,
} from "@/lib/dates-display-fr";

const TZ_BEIRUT = "Asia/Beirut";

/** 6 days starting at offset -2 (2 before + current + 3 after). */
function buildCalendarDays(currentIso: string): string[] {
  return Array.from({ length: 6 }, (_, i) => shiftIsoDate(currentIso, i - 2));
}

function formatDaySegment(iso: string): { weekday: string; day: string } {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const utc = Date.UTC(y, m - 1, d, 12, 0, 0);
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: TZ_BEIRUT })
    .format(utc)
    .replace(/\.$/, "")
    .toLowerCase();
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", timeZone: TZ_BEIRUT }).format(utc);
  return { weekday, day };
}

export type EditionDateRailNewProps = {
  currentIso: string;
  editionWindow?: { start: string; end: string } | null;
  className?: string;
};

/**
 * Rail date édition — design final : titre animé, fenêtre collecte Signal, frise réelle, calendrier segmenté.
 * Remplace `EditionDateRail` avec `unifiedHeader`.
 */
export function EditionDateRailNew({
  currentIso,
  editionWindow,
  className = "",
}: EditionDateRailNewProps): ReactElement {
  /* ── Fade animé sur changement de jour ── */
  const [visible, setVisible] = useState(true);
  const [displayIso, setDisplayIso] = useState(currentIso);
  const prevRef = useRef(currentIso);

  useEffect(() => {
    if (prevRef.current === currentIso) {
      return;
    }
    prevRef.current = currentIso;
    setVisible(false);
    const t = setTimeout(() => {
      setDisplayIso(currentIso);
      setVisible(true);
    }, 175);
    return () => clearTimeout(t);
  }, [currentIso]);

  const fadeClass = `transition-[opacity,transform] duration-[175ms] ease-out ${
    visible ? "translate-y-0 opacity-100" : "-translate-y-[3px] opacity-0"
  }`;

  const title = formatEditionCalendarTitleFr(displayIso);

  /* ── Fenêtre collecte ── */
  const hasWindow = Boolean(editionWindow?.start && editionWindow?.end);
  const startTime = hasWindow ? formatFriseBoundaryTimeFr(editionWindow!.start) : null;
  const endTime = hasWindow ? formatFriseBoundaryTimeFr(editionWindow!.end) : null;
  const startDay = hasWindow ? formatFriseEdgeDayFr(editionWindow!.start) : null;
  const endDay = hasWindow ? formatFriseEdgeDayFr(editionWindow!.end) : null;

  /* ── Calendrier ── */
  const calDays = buildCalendarDays(currentIso);

  return (
    <div className={`w-full ${className}`.trim()}>
      {/* Titre animé */}
      <h1
        className={`font-[family-name:var(--font-serif)] text-[1.5rem] font-normal leading-snug tracking-tight text-foreground sm:text-[1.875rem] ${fadeClass}`}
      >
        {title}
      </h1>

      {/* Séparateur */}
      <div className="mt-5 h-px bg-gradient-to-r from-transparent via-border/55 to-transparent" />

      {/* Fenêtre collecte — Signal full-width */}
      {startTime && endTime && startDay && endDay ? (
        <div className={`mt-5 flex items-end justify-between gap-3 sm:gap-4 ${fadeClass}`}>
          <div className="shrink-0">
            <p className="font-mono text-[1.55rem] font-extralight tabular-nums leading-none tracking-[-0.025em] text-foreground sm:text-[1.9rem]">
              {startTime}
            </p>
            <p className="mt-1.5 text-[9px] font-normal uppercase tracking-[0.18em] text-muted-foreground/70 sm:tracking-[0.22em]">
              {startDay}
            </p>
          </div>

          {/* Ligne pointillée */}
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
            <p className="mt-1.5 text-[9px] font-normal uppercase tracking-[0.18em] text-muted-foreground/70 sm:tracking-[0.22em]">
              {endDay}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4" />
      )}

      {/* Frise — EditionPeriodFrise avec données réelles */}
      {editionWindow?.start && editionWindow?.end ? (
        <div className="mt-5">
          <EditionPeriodFrise
            windowStartIso={editionWindow.start}
            windowEndIso={editionWindow.end}
            publishRouteIso={currentIso}
            hideHeader
            unifiedDayNav={{ mode: "edition", dayRadius: 4 }}
          />
        </div>
      ) : null}

      {/* Navigation : ‹ [calendrier segmenté] › */}
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
                <span
                  className={`block text-[7px] uppercase leading-none tracking-[0.1em] sm:text-[7.5px] ${
                    on ? "opacity-55" : "opacity-45"
                  }`}
                >
                  {weekday}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] tabular-nums leading-none sm:text-[12px] ${
                    on ? "font-semibold" : "font-normal"
                  }`}
                >
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
