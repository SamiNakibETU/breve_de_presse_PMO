import type { ClusterFallbackRow } from "./types";

/** Libellé de sujet : remplace les cadratins souvent générés par LLM par « : » pour l’affichage. */
export function displayClusterTitle(label: string | null | undefined): string {
  if (!label?.trim()) return "Sans libellé";
  return label
    .replace(/\s*—\s*/g, " : ")
    .replace(/—/g, " : ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Repli si l’API renvoie encore un libellé vide (titres d’articles du cluster). */
export function clusterFallbackDisplayTitle(row: ClusterFallbackRow): string {
  const fromLabel = row.label?.trim();
  if (fromLabel) return fromLabel;
  const first = row.articles.find((a) => a.title.trim());
  if (first?.title.trim()) return first.title.trim();
  return "Thème sans libellé";
}
