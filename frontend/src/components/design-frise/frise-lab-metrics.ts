/**
 * Grille unique du laboratoire frise — mesures en px entiers.
 * h = 0 → sam. 4 avr. 2026 00:00 (Asia/Beirut, démo).
 */

export const LAB_PX_PER_HOUR = 10;

/** Dernier index d’heure affiché sur la piste (tick à 0 … LAB_LAST_H inclusive). */
export const LAB_LAST_H = 144;

export const LAB_TOTAL_HOURS = LAB_LAST_H;

/** Hauteur utile des traits au-dessus des labels d’heures. */
export const LAB_RAIL_INNER_H = 52;

export const LAB_TICK = {
  wMinor: 1,
  wCollect: 1,
  wMidnight: 1,
  wEdge: 2,
  hMinor: 8,
  hCollect: 20,
  hMidnight: LAB_RAIL_INNER_H,
  hEdge: LAB_RAIL_INNER_H,
} as const;

/** Lun. 6 avr. 18:00 → mar. 7 avr. 06:00 (indices sur la grille démo). */
export const LAB_COLLECT = { startH: 66, endH: 78 } as const;

export const LAB_DAY_ANCHORS: readonly { id: string; label: string; title: string; anchorHour: number }[] = [
  { id: "2026-04-04", label: "sam. 4", title: "Samedi 4 avril 2026", anchorHour: 12 },
  { id: "2026-04-05", label: "dim. 5", title: "Dimanche 5 avril 2026", anchorHour: 36 },
  { id: "2026-04-06", label: "lun. 6", title: "Lundi 6 avril 2026", anchorHour: 60 },
  { id: "2026-04-07", label: "mar. 7", title: "Mardi 7 avril 2026", anchorHour: 84 },
  { id: "2026-04-08", label: "mer. 8", title: "Mercredi 8 avril 2026", anchorHour: 108 },
  { id: "2026-04-09", label: "jeu. 9", title: "Jeudi 9 avril 2026", anchorHour: 132 },
];

export const LAB_DEFAULT_DAY_ID = "2026-04-07";

export function labHourToPx(hour: number): number {
  return hour * LAB_PX_PER_HOUR;
}

export function labTrackWidthPx(): number {
  return LAB_LAST_H * LAB_PX_PER_HOUR;
}

export function labDayById(id: string): (typeof LAB_DAY_ANCHORS)[number] | undefined {
  return LAB_DAY_ANCHORS.find((d) => d.id === id);
}

export function labClampHour(h: number): number {
  return Math.max(0, Math.min(LAB_LAST_H, Math.round(h)));
}

/** Indice midi (démo) du bloc 24 h contenant cette heure — pratique pour recentrer sur une journée. */
export function labNoonForHourBlock(hourIndex: number): number {
  const h = labClampHour(hourIndex);
  const block = Math.floor(h / 24);
  return Math.min(LAB_LAST_H, block * 24 + 12);
}

/** Heure dans la fenêtre collecte démo (lun. 18h → mar. 6h sur la grille). */
export function labHourInCollectDemo(hourIndex: number): boolean {
  const h = labClampHour(hourIndex);
  return h >= LAB_COLLECT.startH && h <= LAB_COLLECT.endH;
}

/**
 * Fenêtre collecte **par édition** sur la grille démo : autour de l’ancre midi, veille 18h → jour J 6h
 * (même logique que l’exemple 66–78 pour l’ancre mar. 84).
 */
export function labCollectWindowForAnchor(anchorHour: number): { startH: number; endH: number } {
  const a = labClampHour(anchorHour);
  let startH = Math.max(0, a - 18);
  let endH = Math.min(LAB_LAST_H, a - 6);
  if (endH <= startH) {
    startH = Math.max(0, a - 12);
    endH = Math.min(LAB_LAST_H, a);
  }
  return { startH, endH };
}

/** Ancre d’édition la plus proche du repère flottant (choix discret par jour). */
export function labNearestEditionAnchorHour(floatH: number): number {
  const f = Math.max(0, Math.min(LAB_LAST_H, floatH));
  let best = LAB_DAY_ANCHORS[0]!.anchorHour;
  let bestD = Infinity;
  for (const d of LAB_DAY_ANCHORS) {
    const dist = Math.abs(f - d.anchorHour);
    if (dist < bestD) {
      bestD = dist;
      best = d.anchorHour;
    }
  }
  return best;
}
