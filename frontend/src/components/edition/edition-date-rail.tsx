"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { shiftIsoDate } from "@/lib/beirut-date";
import {
  formatEditionCalendarTitleFr,
  formatEditionDayHeadingFr,
} from "@/lib/dates-display-fr";
import {
  UI_SURFACE_FRISE_DIVIDER,
  UI_SURFACE_INSET,
  UI_SURFACE_RAIL_PAD,
} from "@/lib/ui-surface-classes";

export type EditionDateRailWindow = { start: string; end: string };

export type EditionDateRailProps = {
  currentIso: string;
  className?: string;
  editionWindow?: EditionDateRailWindow | null;
  /**
   * Si true : titre du jour, contrôles et frise dans un seul bloc visuel (remplace un h1 séparé).
   */
  unifiedHeader?: boolean;
};

/**
 * Navigation entre jours + frise fenêtre collecte. Mode `unifiedHeader` : même carte que titre + ← calendrier →.
 */
export function EditionDateRail({
  currentIso,
  className = "",
  editionWindow = null,
  unifiedHeader = false,
}: EditionDateRailProps) {
  const prevIso = shiftIsoDate(currentIso, -1);
  const nextIso = shiftIsoDate(currentIso, 1);
  const title = formatEditionCalendarTitleFr(currentIso);
  const headingA11y = formatEditionDayHeadingFr(currentIso);

  const controls = (
    <>
      <Link
        href={`/edition/${prevIso}`}
        scroll={false}
        className="olj-date-rail__chevron"
        aria-label={`Jour précédent : ${formatEditionDayHeadingFr(prevIso)}`}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </Link>
      <EditionCalendarPopover currentIso={currentIso} compact />
      <Link
        href={`/edition/${nextIso}`}
        scroll={false}
        className="olj-date-rail__chevron"
        aria-label={`Jour suivant : ${formatEditionDayHeadingFr(nextIso)}`}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </Link>
    </>
  );

  if (unifiedHeader) {
    return (
      <div
        className={`w-full max-w-4xl ${UI_SURFACE_INSET} ${UI_SURFACE_RAIL_PAD} ${className}`.trim()}
        aria-label="Choisir une date d’édition"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          {controls}
          <h1 className="min-w-0 flex-1 text-center font-[family-name:var(--font-serif)] text-[1.25rem] font-semibold capitalize leading-tight text-foreground sm:text-left sm:text-[1.65rem] sm:leading-tight">
            {title}
          </h1>
        </div>
        {editionWindow?.start && editionWindow?.end ? (
          <div className={UI_SURFACE_FRISE_DIVIDER}>
            <EditionPeriodFrise
              windowStartIso={editionWindow.start}
              windowEndIso={editionWindow.end}
              publishRouteIso={currentIso}
              unifiedDayNav={{ mode: "edition", dayRadius: 10 }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`flex w-full max-w-full flex-col gap-3 ${className}`.trim()}
      aria-label="Choisir une date d’édition"
    >
      <div className="flex w-full items-center justify-center gap-2 sm:justify-start">
        {controls}
        <span className="sr-only">Date affichée : {headingA11y}</span>
      </div>
      {editionWindow?.start && editionWindow?.end ? (
        <EditionPeriodFrise
          windowStartIso={editionWindow.start}
          windowEndIso={editionWindow.end}
          publishRouteIso={currentIso}
          unifiedDayNav={{ mode: "edition", dayRadius: 10 }}
        />
      ) : null}
    </div>
  );
}
