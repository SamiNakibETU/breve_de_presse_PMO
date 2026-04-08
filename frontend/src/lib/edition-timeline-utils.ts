/**
 * Calculs pour la frise horaire d’édition (fenêtre API + repères calendaires Beyrouth).
 * Les instants `window_start` / `window_end` viennent du backend en ISO 8601 (UTC).
 */

import { shiftIsoDate } from "@/lib/beirut-date";

const TZ_BEIRUT = "Asia/Beirut";

const beirutParts = (t: number) => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BEIRUT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const o = Object.fromEntries(
    fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(o.year),
    m: Number(o.month),
    d: Number(o.day),
    h: Number(o.hour),
    min: Number(o.minute),
  };
};

/** Premier instant UTC (par pas de 1 min) où Beyrouth est minuit pour le jour civil (y,m,d). */
export function findBeirutMidnightUtc(y: number, m: number, d: number): number {
  const start = Date.UTC(y, m - 1, d - 2);
  const end = Date.UTC(y, m - 1, d + 3);
  for (let t = start; t < end; t += 60 * 1000) {
    const p = beirutParts(t);
    if (p.y === y && p.m === m && p.d === d && p.h === 0 && p.min === 0) {
      return t;
    }
  }
  return Date.UTC(y, m - 1, d);
}

/**
 * Jour civil Beyrouth correspondant au repère de route `YYYY-MM-DD` (midi UTC sur ce jour).
 */
export function beirutCalendarFromRouteDateIso(isoYmd: string): {
  y: number;
  m: number;
  d: number;
} {
  const parts = isoYmd.split("-").map(Number);
  const y0 = parts[0] ?? 1970;
  const mo0 = parts[1] ?? 1;
  const d0 = parts[2] ?? 1;
  const anchor = Date.UTC(y0, mo0 - 1, d0, 12, 0, 0);
  const p = beirutParts(anchor);
  return { y: p.y, m: p.m, d: p.d };
}

export function beirutDayBoundsFromRouteDate(isoYmd: string): {
  startMs: number;
  endMs: number;
} {
  const { y, m, d } = beirutCalendarFromRouteDateIso(isoYmd);
  const startMs = findBeirutMidnightUtc(y, m, d);
  let t = startMs + 18 * 3600 * 1000;
  const endCap = startMs + 50 * 3600 * 1000;
  while (t < endCap) {
    const p = beirutParts(t);
    if (
      p.h === 0 &&
      p.min === 0 &&
      (p.d !== d || p.m !== m || p.y !== y)
    ) {
      return { startMs, endMs: t };
    }
    t += 60 * 1000;
  }
  return { startMs, endMs: startMs + 24 * 3600 * 1000 };
}

export type TimelineTick = { ms: number; label: string; kind: "hour" | "day" };

const hourLabelBeirut = (ms: number): string =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ_BEIRUT,
  }).format(new Date(ms));

/**
 * Graduations horaires (pas `stepHours`) entre deux bornes, alignées sur des multiples de step depuis l’origine.
 */
export function hourTicksBetween(
  startMs: number,
  endMs: number,
  stepHours: number,
): TimelineTick[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  const step = stepHours * 3600 * 1000;
  let t = Math.floor(startMs / step) * step;
  const out: TimelineTick[] = [];
  while (t < endMs + step) {
    if (t >= startMs - 1 && t <= endMs + 1) {
      out.push({ ms: t, label: hourLabelBeirut(t), kind: "hour" });
    }
    t += step;
  }
  return out;
}

export function timelineVisibleRange(
  windowStartMs: number,
  windowEndMs: number,
  publishRouteIso: string,
  paddingMs: number,
): { rangeStart: number; rangeEnd: number } {
  const prevIso = shiftIsoDate(publishRouteIso, -1);
  const prevB = beirutDayBoundsFromRouteDate(prevIso);
  const curB = beirutDayBoundsFromRouteDate(publishRouteIso);
  const rangeStart = Math.min(windowStartMs, prevB.startMs) - paddingMs;
  const rangeEnd = Math.max(windowEndMs, curB.endMs) + paddingMs;
  return { rangeStart, rangeEnd };
}

/**
 * Étend la plage « cœur » (API + padding) pour permettre un pan horizontal sur la frise.
 * `sidePadRatio` : fraction de la durée cœur ajoutée à gauche et à droite (ex. 0.42 → ~84 % de largeur en plus).
 */
export function extendedTimelineBounds(
  windowStartMs: number,
  windowEndMs: number,
  publishRouteIso: string,
  paddingMs: number,
  sidePadRatio: number,
): { extStart: number; extEnd: number; coreStart: number; coreEnd: number } {
  const { rangeStart: coreStart, rangeEnd: coreEnd } = timelineVisibleRange(
    windowStartMs,
    windowEndMs,
    publishRouteIso,
    paddingMs,
  );
  const coreSpan = coreEnd - coreStart;
  const side = coreSpan * sidePadRatio;
  return {
    coreStart,
    coreEnd,
    extStart: coreStart - side,
    extEnd: coreEnd + side,
  };
}

export function percentAlong(
  ms: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  if (rangeEnd <= rangeStart) return 0;
  return ((ms - rangeStart) / (rangeEnd - rangeStart)) * 100;
}

const HOUR_MS = 3600 * 1000;
const MAX_FRISE_RULER_TICKS = 280;

export type FriseRulerTickKind = "day" | "major" | "minor";

/** Graduation pour la règle : minuit Beyrouth (jour), heures « rondes » 6h, heures de collecte fines. */
export type FriseRulerTick = {
  ms: number;
  pct: number;
  kind: FriseRulerTickKind;
};

export function buildFriseRulerTicks(
  extStart: number,
  extEnd: number,
): FriseRulerTick[] {
  if (!Number.isFinite(extStart) || !Number.isFinite(extEnd) || extEnd <= extStart) {
    return [];
  }
  const spanH = (extEnd - extStart) / HOUR_MS;
  let t = Math.floor(extStart / HOUR_MS) * HOUR_MS;
  if (t < extStart) {
    t += HOUR_MS;
  }
  const out: FriseRulerTick[] = [];
  while (t <= extEnd + 1) {
    const p = beirutParts(t);
    let kind: FriseRulerTickKind;
    if (p.h === 0 && p.min === 0) {
      kind = "day";
    } else if (p.h % 6 === 0 && p.min === 0) {
      kind = "major";
    } else {
      kind = "minor";
    }
    if (kind === "minor") {
      if (spanH > 200 && p.h % 2 === 1) {
        t += HOUR_MS;
        continue;
      }
      if (spanH > 380 && p.h % 4 !== 0) {
        t += HOUR_MS;
        continue;
      }
    }
    out.push({
      ms: t,
      pct: percentAlong(t, extStart, extEnd),
      kind,
    });
    if (out.length >= MAX_FRISE_RULER_TICKS) {
      break;
    }
    t += HOUR_MS;
  }
  return out;
}
