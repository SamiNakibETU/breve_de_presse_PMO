import {
  LAB_DAY_ANCHORS,
  LAB_LAST_H,
  LAB_PX_PER_HOUR,
} from "@/components/design-frise/frise-lab-metrics";

/** Débuts de jour calendaire sur la grille démo (minuit). */
export const LAB_DAY_START_HOURS: readonly number[] = [0, 24, 48, 72, 96, 120];

export function labClampFloatH(h: number): number {
  return Math.max(0, Math.min(LAB_LAST_H, h));
}

export function labSnapHourOnly(floatH: number): number {
  return Math.round(labClampFloatH(floatH));
}

/**
 * Si le centre est proche d’un minuit, aligne sur ce jour ; sinon heure entière la plus proche.
 */
export function labSnapWithDayMagnet(floatH: number, magnetBandH: number): number {
  const f = labClampFloatH(floatH);
  let nearestM = LAB_DAY_START_HOURS[0]!;
  let distM = Infinity;
  for (const m of LAB_DAY_START_HOURS) {
    const d = Math.abs(f - m);
    if (d < distM) {
      distM = d;
      nearestM = m;
    }
  }
  if (distM <= magnetBandH) {
    return nearestM;
  }
  return Math.round(f);
}

/**
 * Favorise les ancres « midi » d’édition quand le repère est proche ; sinon heure entière.
 */
export function labSnapWithAnchorMagnet(floatH: number, magnetBandH: number): number {
  const f = labClampFloatH(floatH);
  const rounded = Math.round(f);
  let best = rounded;
  let bestDist = Math.abs(f - rounded);
  for (const d of LAB_DAY_ANCHORS) {
    const dist = Math.abs(f - d.anchorHour);
    if (dist <= magnetBandH && dist <= bestDist) {
      best = d.anchorHour;
      bestDist = dist;
    }
  }
  return Math.max(0, Math.min(LAB_LAST_H, best));
}

/** Heure sous le point cliqué (coordonnées viewport → piste). */
export function labHourFromRailPointer(
  clientX: number,
  scrollEl: HTMLDivElement,
  padPx: number,
): number {
  const rect = scrollEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const trackX = scrollEl.scrollLeft + x - padPx;
  const h = trackX / LAB_PX_PER_HOUR;
  return Math.max(0, Math.min(LAB_LAST_H, Math.round(h)));
}

/** Repère flottant sous le pointeur (tap / hit-test) — pour snap sur ancres d’édition. */
export function labFloatHourFromRailPointer(
  clientX: number,
  scrollEl: HTMLDivElement,
  padPx: number,
): number {
  const rect = scrollEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const trackX = scrollEl.scrollLeft + x - padPx;
  return labClampFloatH(trackX / LAB_PX_PER_HOUR);
}

export function labCenterFloatFromScroll(scrollEl: HTMLDivElement, padPx: number): number {
  const midPx = scrollEl.scrollLeft + scrollEl.clientWidth / 2 - padPx;
  return labClampFloatH(midPx / LAB_PX_PER_HOUR);
}

/** Minuit de grille le plus proche (0, 24, …, 144) — utile pour un saut explicite. */
export function labNearestMidnightHour(hourIndex: number): number {
  const f = labClampFloatH(hourIndex);
  const candidates = [...LAB_DAY_START_HOURS, LAB_LAST_H] as const;
  let best = candidates[0]!;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = Math.abs(f - c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
