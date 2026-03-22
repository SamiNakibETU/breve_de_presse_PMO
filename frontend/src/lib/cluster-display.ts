/** Libellé de sujet : remplace les cadratins souvent générés par LLM par « : » pour l’affichage. */
export function displayClusterTitle(label: string | null | undefined): string {
  if (!label?.trim()) return "Sans libellé";
  return label
    .replace(/\s*—\s*/g, " : ")
    .replace(/—/g, " : ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
