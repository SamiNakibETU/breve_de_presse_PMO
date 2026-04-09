import { LAB_LAST_H } from "@/components/design-frise/frise-lab-metrics";

/**
 * Origine grille démo : 2026-04-04 00:00 en Asia/Beirut (UTC+3 en avril), en ms absolues.
 * Évite `new Date(y, m, d)` + setHours en **heure locale machine** : SSR (souvent UTC) ≠ navigateur → hydratation cassée.
 */
const LAB_GRID_ORIGIN_MS = Date.parse("2026-04-03T21:00:00.000Z");

const LAB_TZ: Intl.DateTimeFormatOptions["timeZone"] = "Asia/Beirut";

/** Grille démo : 4 avr. 2026 00:00 Beyrouth + index d’heures (chronologiques). */
export function labHourIndexToDate(hourIndex: number): Date {
  const h = Math.max(0, Math.min(LAB_LAST_H, Math.round(hourIndex)));
  return new Date(LAB_GRID_ORIGIN_MS + h * 3_600_000);
}

export function labFormatClock24(hourIndex: number): string {
  const d = labHourIndexToDate(hourIndex);
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: LAB_TZ,
  });
}

export function labFormatDateLongFr(hourIndex: number): string {
  return labHourIndexToDate(hourIndex).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: LAB_TZ,
  });
}

export function labFormatBoundaryDateTimeFr(hourIndex: number): { date: string; time: string } {
  const d = labHourIndexToDate(hourIndex);
  return {
    date: d.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: LAB_TZ,
    }),
    time: d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: LAB_TZ,
    }),
  };
}

/** Libellé court pour une ligne méta (évite la répétition sur petites largeurs). */
export function labFormatBoundaryShortFr(hourIndex: number): string {
  return labHourIndexToDate(hourIndex).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LAB_TZ,
  });
}

/** Une ligne : période de collecte (maquette grille). */
export function labFormatCollectRangeLineFr(startH: number, endH: number): string {
  const a = labFormatBoundaryDateTimeFr(startH);
  const b = labFormatBoundaryDateTimeFr(endH);
  return `${a.date} · ${a.time} — ${b.date} · ${b.time}`;
}

/** Méta courte (sous-titre épuré). */
export function labFormatCollectRangeMetaFr(startH: number, endH: number): string {
  const a = labFormatBoundaryDateTimeFr(startH);
  const b = labFormatBoundaryDateTimeFr(endH);
  return `${labFormatBoundaryShortFr(startH)} ${a.time} — ${labFormatBoundaryShortFr(endH)} ${b.time}`;
}

/** Libellé d'heure court : « 0h », « 6h », « 18h »… */
export function labHourLabel(hourIndex: number): string {
  const h = ((Math.round(hourIndex) % 24) + 24) % 24;
  return h === 0 ? "0h" : `${h}h`;
}

/** Jour court sans l'année : « lun. 6 avr. » */
export function labFormatDayShortFr(hourIndex: number): string {
  return labHourIndexToDate(hourIndex).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: LAB_TZ,
  });
}
