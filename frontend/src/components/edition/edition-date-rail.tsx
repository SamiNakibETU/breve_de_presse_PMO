"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { EditionCalendarPopover } from "@/components/edition/edition-calendar-popover";
import { EditionPeriodFrise } from "@/components/edition/edition-period-frise";
import { shiftIsoDate } from "@/lib/beirut-date";
import { formatEditionDayHeadingFr } from "@/lib/dates-display-fr";

export type EditionDateRailWindow = { start: string; end: string };

export type EditionDateRailProps = {
  currentIso: string;
  className?: string;
  editionWindow?: EditionDateRailWindow | null;
};

/**
 * Navigation discrète entre jours + frise « Figma » pour la fenêtre de collecte (sans bandeau à puces).
 */
export function EditionDateRail({
  currentIso,
  className = "",
  editionWindow = null,
}: EditionDateRailProps) {
  const prevIso = shiftIsoDate(currentIso, -1);
  const nextIso = shiftIsoDate(currentIso, 1);
  const heading = formatEditionDayHeadingFr(currentIso);

  return (
    <div
      className={`flex w-full max-w-full flex-col gap-3 ${className}`.trim()}
      aria-label="Choisir une date d’édition"
    >
      <div className="flex w-full max-w-3xl items-center justify-center gap-2 sm:justify-start">
        <Link
          href={`/edition/${prevIso}`}
          scroll={false}
          className="olj-date-rail__chevron flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={`Jour précédent : ${formatEditionDayHeadingFr(prevIso)}`}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Link>
        <EditionCalendarPopover currentIso={currentIso} compact />
        <span className="sr-only">Date affichée : {heading}</span>
        <Link
          href={`/edition/${nextIso}`}
          scroll={false}
          className="olj-date-rail__chevron flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={`Jour suivant : ${formatEditionDayHeadingFr(nextIso)}`}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      {editionWindow?.start && editionWindow?.end ? (
        <EditionPeriodFrise
          windowStartIso={editionWindow.start}
          windowEndIso={editionWindow.end}
          publishRouteIso={currentIso}
        />
      ) : null}
    </div>
  );
}
