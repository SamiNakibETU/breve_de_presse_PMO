import type { KeyboardEvent } from "react";
import { LAB_COLLECT, labClampHour } from "@/components/design-frise/frise-lab-metrics";

export type FriseLabKeyboardNavCtx = {
  centerHour: () => number;
  scrollToHour: (hour: number, behavior?: ScrollBehavior) => void;
};

/**
 * Sauts de 6 h (Page préc./suiv. ou Maj + flèches). Retourne vrai si l’événement est consommé.
 */
export function tryFriseLabPageStepKeys(
  e: KeyboardEvent<HTMLDivElement>,
  ctx: FriseLabKeyboardNavCtx,
): boolean {
  const step =
    e.key === "PageDown" || (e.shiftKey && e.key === "ArrowRight")
      ? 6
      : e.key === "PageUp" || (e.shiftKey && e.key === "ArrowLeft")
        ? -6
        : 0;
  if (step === 0) {
    return false;
  }
  e.preventDefault();
  ctx.scrollToHour(labClampHour(ctx.centerHour() + step));
  return true;
}

/** Flèches, Origine / Fin (début / fin fenêtre collecte démo). */
export function tryFriseLabArrowHomeEndKeys(
  e: KeyboardEvent<HTMLDivElement>,
  ctx: FriseLabKeyboardNavCtx,
): boolean {
  if (e.key === "ArrowLeft" && !e.shiftKey) {
    e.preventDefault();
    ctx.scrollToHour(labClampHour(ctx.centerHour() - 1));
    return true;
  }
  if (e.key === "ArrowRight" && !e.shiftKey) {
    e.preventDefault();
    ctx.scrollToHour(labClampHour(ctx.centerHour() + 1));
    return true;
  }
  if (e.key === "Home") {
    e.preventDefault();
    ctx.scrollToHour(LAB_COLLECT.startH);
    return true;
  }
  if (e.key === "End") {
    e.preventDefault();
    ctx.scrollToHour(LAB_COLLECT.endH);
    return true;
  }
  return false;
}
