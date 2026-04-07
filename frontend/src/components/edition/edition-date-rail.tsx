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
  UI_FRISE_CONTROL_ROW,
  UI_SURFACE_FRise_INSET,
  UI_SURFACE_FRISE_DIVIDER,
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
        className={`${UI_SURFACE_FRise_INSET} ${className}`.trim()}
        aria-label="Choisir une date d’édition"
      >
        <h1 className="mb-4 text-balance text-center font-[family-name:var(--font-serif)] text-[1.35rem] font-semibold capitalize leading-[1.15] tracking-tight text-foreground sm:text-[1.625rem]">
          {title}
        </h1>
        <div className={`${UI_FRISE_CONTROL_ROW} mb-2`}>
          {controls}
        </div>
        <p className="mx-auto mb-0 max-w-sm text-center text-[10px] leading-snug text-muted-foreground/90 sm:max-w-md sm:text-[11px]">
          Glisser le contexte · jour ou piste · même repère que Panorama et Articles.
        </p>
        {editionWindow?.start && editionWindow?.end ? (
          <div className={UI_SURFACE_FRISE_DIVIDER}>
            <EditionPeriodFrise
              windowStartIso={editionWindow.start}
              windowEndIso={editionWindow.end}
              publishRouteIso={currentIso}
              unifiedDayNav={{ mode: "edition", dayRadius: 8 }}
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
      <div className={UI_FRISE_CONTROL_ROW}>
        {controls}
        <span className="sr-only">Date affichée : {headingA11y}</span>
      </div>
      <p className="mx-auto max-w-md text-center text-[10px] leading-snug text-muted-foreground/90 sm:text-[11px]">
        Glisser le contexte · jour ou piste · même repère que Panorama et l’édition.
      </p>
      {editionWindow?.start && editionWindow?.end ? (
        <EditionPeriodFrise
          windowStartIso={editionWindow.start}
          windowEndIso={editionWindow.end}
          publishRouteIso={currentIso}
          unifiedDayNav={{ mode: "edition", dayRadius: 8 }}
        />
      ) : null}
    </div>
  );
}
