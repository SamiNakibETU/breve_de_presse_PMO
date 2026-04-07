/**
 * Affichage métier commun pour GET /api/media-sources/health
 * (pipeline Régie + page Sources).
 */

import { formatLogTimestampFr } from "@/lib/dates-display-fr";
import type { MediaSourceHealthRow } from "@/lib/types";

export function collecteStatusFr(code: string): { label: string; rowClass: string } {
  const c = (code || "").toLowerCase();
  if (c === "dead") {
    return {
      label: "Collecte interrompue",
      rowClass: "bg-destructive/[0.07]",
    };
  }
  if (c === "degraded") {
    return {
      label: "Collecte irrégulière",
      rowClass: "bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)]",
    };
  }
  return {
    label: "Collecte normale",
    rowClass: "bg-transparent",
  };
}

export function formatTranslationHint(s: {
  translation_24h_ok_persisted?: number | null;
  translation_24h_errors_persisted?: number | null;
}): string | null {
  const okP = s.translation_24h_ok_persisted;
  const err = s.translation_24h_errors_persisted;
  if (okP == null && (err == null || err === 0)) return null;
  const parts: string[] = [];
  if (okP != null) {
    parts.push(
      `${okP} traduction${okP !== 1 ? "s" : ""} enregistrée${okP !== 1 ? "s" : ""} (24 h)`,
    );
  }
  if (err != null && err > 0) {
    parts.push(
      `${err} erreur${err !== 1 ? "s" : ""} de traduction persistée${err !== 1 ? "s" : ""}`,
    );
  }
  return parts.length ? parts.join(". ") : null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Résumé d’une ligne `last_collection` du payload API. */
export function formatLastCollectionSummary(
  lc: MediaSourceHealthRow["last_collection"],
): string | null {
  if (!isRecord(lc)) return null;
  const completed = lc.completed_at;
  const articlesNew = lc.articles_new;
  const duration = lc.duration_seconds;
  const parts: string[] = [];
  if (typeof completed === "string" && completed.trim()) {
    parts.push(`Dernière collecte : ${formatLogTimestampFr(completed)}`);
  }
  if (typeof articlesNew === "number") {
    parts.push(`${articlesNew} nouveau${articlesNew !== 1 ? "x" : ""} article${articlesNew !== 1 ? "s" : ""}`);
  }
  if (typeof duration === "number" && duration > 0) {
    parts.push(`${duration.toFixed(0)} s`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function articlesWindowLabel(count: number, windowHours: number): string {
  return `${count} article${count !== 1 ? "s" : ""} (${windowHours} h)`;
}
