import type { Article, TopicArticlePreview } from "@/lib/types";

/** Codes pays distincts issus des aperçus (vérité terrain > métadonnées LLM du sujet). */
export function countryCodesFromPreviews(
  previews: TopicArticlePreview[] | null | undefined,
): string[] {
  const s = new Set<string>();
  for (const p of previews ?? []) {
    const c = (p.country_code ?? "").trim().toUpperCase();
    if (c) s.add(c);
  }
  return [...s].sort();
}

/** Codes pays distincts issus des articles chargés (fiche sujet). */
export function countryCodesFromArticles(
  articles: Article[] | null | undefined,
): string[] {
  const s = new Set<string>();
  for (const a of articles ?? []) {
    const c = (a.country_code ?? "").trim().toUpperCase();
    if (c) s.add(c);
  }
  return [...s].sort();
}
