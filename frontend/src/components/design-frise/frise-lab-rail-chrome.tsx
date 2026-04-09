"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactElement } from "react";
import { UI_FRISE_CONTROL_ROW } from "@/lib/ui-surface-classes";

const BTN =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type FriseLabRailChromeProps = {
  title: string;
  onPrev: () => void;
  onNext: () => void;
  /** Titre fort type « date picker » minimal (lab édition). */
  size?: "default" | "hero";
};

export function FriseLabRailChrome({
  title,
  onPrev,
  onNext,
  size = "default",
}: FriseLabRailChromeProps): ReactElement {
  const titleCls =
    size === "hero"
      ? "mb-3 text-center font-[family-name:var(--font-serif)] text-[1.35rem] font-semibold capitalize leading-[1.15] tracking-tight text-foreground sm:text-[1.625rem]"
      : "olj-frise-title-fade mb-1 text-center text-[1.0625rem] font-semibold leading-snug tracking-[-0.02em] text-foreground sm:text-[1.125rem]";

  return (
    <>
      <h1 className={titleCls}>{title}</h1>
      <div className={UI_FRISE_CONTROL_ROW}>
        <button type="button" className={BTN} aria-label="Jour précédent" onClick={onPrev}>
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
        <button type="button" className={BTN} aria-label="Calendrier (démo)" disabled>
          <CalendarDays className="h-4 w-4 opacity-45" strokeWidth={1.75} aria-hidden />
        </button>
        <button type="button" className={BTN} aria-label="Jour suivant" onClick={onNext}>
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </>
  );
}
