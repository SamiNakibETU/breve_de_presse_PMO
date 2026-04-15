import type { Article } from "@/lib/types";

/**
 * Réduit un id taxonomique (ex. mena.geopolitics.iran.golfe) à une famille stable
 * pour regrouper des articles dont les listes d’ids diffèrent légèrement mais
 * partagent le même socle éditorial.
 */
export function oljTopicIdRootSegment(id: string): string {
  const p = id
    .trim()
    .toLowerCase()
    .split(".")
    .filter(Boolean);
  if (p.length === 0) return id.trim().toLowerCase();
  if (p.length === 1) return p[0]!;
  return `${p[0]}.${p[1]}`;
}

/**
 * Clé de regroupement pour la liste Articles : familles OLJ (2 premiers segments),
 * triées et jointes. Moins stricte que la liste complète d’ids triés.
 */
export function oljTopicGroupKey(a: Article): string | null {
  const ids = a.olj_topic_ids;
  if (!ids?.length) return null;
  const roots = [...new Set(ids.map((id) => oljTopicIdRootSegment(id)))].sort();
  return roots.join("|");
}

function humanizeTopicId(id: string): string {
  const t = id.trim();
  if (!t) return "";
  return t
    .replace(/[._]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function topicLabelsForGroupKey(
  groupKey: string | null,
  labelsFr: Record<string, string> | null | undefined,
): string[] {
  if (!groupKey) {
    return ["Sans thème OLJ assigné"];
  }
  return groupKey
    .split("|")
    .map((raw) => {
      const id = raw.trim();
      if (!id) return "";
      const mapped = labelsFr?.[id]?.trim();
      if (mapped) return mapped;
      const withUnderscore = id.replace(/\./g, "_");
      const mapped2 = labelsFr?.[withUnderscore]?.trim();
      return mapped2 || humanizeTopicId(id);
    })
    .filter(Boolean);
}

/** Libellés courts pour affichage en pastilles (liste Articles). */
export function oljTopicGroupChipLabels(
  groupKey: string | null,
  labelsFr: Record<string, string> | null | undefined,
): string[] {
  return topicLabelsForGroupKey(groupKey, labelsFr);
}

/** Libellé de séparateur pour une clé `root1|root2` (texte brut, ex. export). */
export function oljTopicGroupSeparatorLabel(
  groupKey: string | null,
  labelsFr: Record<string, string> | null | undefined,
): string {
  const parts = topicLabelsForGroupKey(groupKey, labelsFr);
  const joined = parts.join(" · ");
  return joined ? `Thème · ${joined}` : "Thème · (non renseigné)";
}
