/**
 * Formats d’affichage des dates côté UI (fuseaux explicites).
 * Voir DESIGN_SYSTEM/patterns-pages.md — Temporalités.
 */

const TZ_BEIRUT = "Asia/Beirut";
const TZ_UTC = "UTC";

/** Titre du jour d’édition pour `YYYY-MM-DD` (parties calendaires UTC, aligné route). */
export function formatEditionCalendarTitleFr(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ_UTC,
  }).format(dt);
}

/** Titre de jour d’édition pour en-tête (première lettre en capitale). */
export function formatEditionDayHeadingFr(isoDate: string): string {
  try {
    const fr = formatEditionCalendarTitleFr(isoDate);
    if (fr.length === 0) return isoDate;
    return fr.charAt(0).toUpperCase() + fr.slice(1);
  } catch {
    return isoDate;
  }
}

export type EditionWindowFormatVariant = "compact" | "long";

/** Fenêtre éditoriale [start, end) — toujours interprétée en heure de Beyrouth à l’affichage. */
export function formatEditionWindowFr(
  isoStart: string,
  isoEnd: string,
  variant: EditionWindowFormatVariant,
): string {
  if (variant === "long") {
    const opts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ_BEIRUT,
    };
    const fmt = new Intl.DateTimeFormat("fr-FR", opts);
    return `Du ${fmt.format(new Date(isoStart))} au ${fmt.format(new Date(isoEnd))} · heure de Beyrouth`;
  }
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_BEIRUT,
  };
  const fmt = new Intl.DateTimeFormat("fr-FR", opts);
  return `${fmt.format(new Date(isoStart))} → ${fmt.format(new Date(isoEnd))}`;
}

/** Date/heure de parution affichée pour la rédaction (Beyrouth). */
export function formatPublishedAtFr(iso: string, variant: "short" | "long"): string {
  const d = new Date(iso);
  if (variant === "long") {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ_BEIRUT,
    }).format(d);
  }
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ_BEIRUT,
  }).format(d);
}

/** Date + heure courtes en heure de Beyrouth (ex. fraîcheur d’un cluster). */
export function formatDateTimeBeirutFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_BEIRUT,
  }).format(new Date(iso));
}

/** Horodatage technique de collecte — fuseau UTC explicite. */
export function formatCollectedAtUtcFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_UTC,
    timeZoneName: "short",
  }).format(new Date(iso));
}

/**
 * Horodatage renvoyé par l’API (souvent ISO). Si parsing impossible, renvoie la chaîne brute.
 * À utiliser pour journaux pipeline / LLM / régie.
 */
export function formatLogTimestampFr(raw: string): string {
  const t = Date.parse(raw);
  if (Number.isNaN(t)) {
    return raw;
  }
  return formatCollectedAtUtcFr(raw);
}

/** Libellés courts pour les puces du rail d’édition (axe jour UTC = paramètre route). */
export function chipLabelsEditionRail(iso: string): {
  weekday: string;
  dayMonth: string;
} {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    timeZone: TZ_UTC,
  })
    .format(dt)
    .replace(/\.$/, "");
  const dayMonth = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: TZ_UTC,
  }).format(dt);
  return { weekday, dayMonth };
}

/** Borne de fenêtre (instant ISO) en libellé court Beyrouth. */
export function formatWindowEdgeBeirut(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_BEIRUT,
  })
    .format(new Date(iso))
    .replace(/\.$/, "");
}

/** Borne de frise (jour civil Beyrouth) — ex. « lundi 6 avril ». */
export function formatFriseBoundaryDateFr(iso: string): string {
  const raw = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ_BEIRUT,
  }).format(new Date(iso));
  return raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
}

/** Heure seule (Beyrouth) pour les bornes de frise — ex. « 18:00 ». */
export function formatFriseBoundaryTimeFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ_BEIRUT,
  }).format(new Date(iso));
}

/** Jour agrégé `YYYY-MM-DD` (UTC) pour tableaux d’usage. */
export function formatUtcDayShortFr(isoYmd: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ_UTC,
  }).format(new Date(`${isoYmd}T12:00:00.000Z`));
}

/** Affiche un jour `YYYY-MM-DD` (calendrier) en libellé long FR (UTC date parts). */
export function formatIsoCalendarDayLongFr(iso: string): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ_UTC,
  }).format(dt);
}

/** Texte d’en-tête pour la vue exploration Articles (période glissante UTC). */
export function formatArticlesExplorationPeriodHint(days: number): string {
  const period =
    days <= 1
      ? "Période : le dernier jour (glissant, UTC)."
      : `Période : les ${days} derniers jours (glissant, UTC).`;
  return `${period} Vue d’exploration ; pour le sommaire daté, ouvrir l’édition du jour.`;
}
