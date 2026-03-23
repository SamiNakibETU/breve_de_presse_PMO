/**
 * Libellés éditoriaux en français (type d’article, langue, badge).
 * Partagé par ArticleRow, TopicSection, etc.
 */

export const FLAGSHIP_BADGE_LABEL = "À la une";

/** Codes connus pour filtres corpus (API `article_type`). */
export const CORPUS_ARTICLE_TYPE_CODES: readonly string[] = [
  "analysis",
  "blog",
  "briefing",
  "column",
  "editorial",
  "feature",
  "interview",
  "news",
  "opinion",
  "reportage",
  "review",
  "tribune",
] as const;

/** Codes langue source pour filtres corpus (API `language`). */
export const CORPUS_SOURCE_LANGUAGE_CODES: readonly string[] = [
  "ar",
  "de",
  "en",
  "es",
  "fa",
  "fr",
  "he",
  "it",
  "ku",
  "ru",
  "tr",
] as const;

const ARTICLE_TYPE_FR: Record<string, string> = {
  news: "Actualité",
  opinion: "Opinion",
  editorial: "Éditorial",
  analysis: "Analyse",
  interview: "Entretien",
  reportage: "Reportage",
  tribune: "Tribune",
  feature: "Enquête",
  column: "Chronique",
  blog: "Blog",
  briefing: "Brève",
  review: "Compte rendu",
};

const SOURCE_LANGUAGE_FR: Record<string, string> = {
  ar: "arabe",
  en: "anglais",
  fr: "français",
  he: "hébreu",
  tr: "turc",
  fa: "persan",
  ku: "kurde",
  de: "allemand",
  es: "espagnol",
  it: "italien",
  ru: "russe",
};

export function articleTypeLabelFr(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  const k = code.trim().toLowerCase();
  return ARTICLE_TYPE_FR[k] ?? code;
}

/** Pictogramme discret par type (brief OLJ, pas de lib d’icônes). */
export function articleTypePictogramFr(
  code: string | null | undefined,
): string {
  const k = (code ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    opinion: "✎",
    editorial: "✎",
    tribune: "✎",
    column: "✎",
    analysis: "◉",
    news: "▪",
    briefing: "▪",
    interview: "◈",
    reportage: "▸",
    feature: "▸",
  };
  return map[k] ?? "▪";
}

export function sourceLanguageLabelFr(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  const k = code.trim().toLowerCase();
  return SOURCE_LANGUAGE_FR[k] ?? code;
}

export function formatArticleMetaLine(opts: {
  mediaName: string;
  country?: string | null;
  articleType?: string | null;
  sourceLanguage?: string | null;
  author?: string | null;
  /** Par défaut : masqué (pas affiché en vue éditoriale). */
  includeSyndicated?: boolean;
  isSyndicated?: boolean | null;
}): string {
  const parts: string[] = [opts.mediaName];
  if (opts.country) parts.push(opts.country);
  const auth = opts.author?.trim();
  if (auth) parts.push(auth);
  const t = articleTypeLabelFr(opts.articleType ?? undefined);
  if (t) parts.push(t);
  const l = sourceLanguageLabelFr(opts.sourceLanguage ?? undefined);
  if (l) parts.push(l);
  if (opts.includeSyndicated && opts.isSyndicated) parts.push("reprise");
  return parts.join(" · ");
}
