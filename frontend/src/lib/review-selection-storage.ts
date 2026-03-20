/**
 * Persistance légère de la sélection revue : localStorage (survit fermeture onglet)
 * + sessionStorage (compat / onglets multiples).
 */
export const REVIEW_ARTICLE_IDS_KEY = "review_article_ids";
const LOCAL_KEY = "olj_review_article_ids_v1";

export function loadReviewArticleIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const parse = (raw: string | null): Set<string> => {
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(
        parsed.filter((x): x is string => typeof x === "string" && x.length > 0),
      );
    };

    const fromLocal = parse(localStorage.getItem(LOCAL_KEY));
    if (fromLocal.size > 0) return fromLocal;

    const fromSession = parse(sessionStorage.getItem(REVIEW_ARTICLE_IDS_KEY));
    if (fromSession.size > 0) {
      localStorage.setItem(
        LOCAL_KEY,
        JSON.stringify(Array.from(fromSession)),
      );
    }
    return fromSession;
  } catch {
    return new Set();
  }
}

export function saveReviewArticleIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(Array.from(ids));
  localStorage.setItem(LOCAL_KEY, raw);
  sessionStorage.setItem(REVIEW_ARTICLE_IDS_KEY, raw);
}
