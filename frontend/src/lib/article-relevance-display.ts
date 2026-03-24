/** Libellés éditoriaux pour la bande de pertinence (sans afficher le score brut). */
export function relevanceBandLabelFr(
  band: string | null | undefined,
  editorialRelevance: number | null | undefined,
): string | null {
  const b = (band ?? "").trim().toLowerCase();
  if (b === "high") return "Très pertinent";
  if (b === "medium") return "Pertinent";
  if (b === "low" || b === "out_of_scope") return "À vérifier";
  if (editorialRelevance == null) return null;
  if (editorialRelevance >= 80) return "Très pertinent";
  if (editorialRelevance >= 50) return "Pertinent";
  return "À vérifier";
}

export function formatAuthorDisplay(author: string | null | undefined): string | null {
  const a = author?.trim();
  if (!a) return null;
  if (/facebook\.com/i.test(a) || /^https?:\/\//i.test(a)) return null;
  return a;
}
