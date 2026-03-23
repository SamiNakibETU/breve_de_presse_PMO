import type { Article, TopicArticleRef } from "@/lib/types";

/**
 * Trie les articles selon l’ordre édition, puis display_order / rank_in_topic, puis recommandation.
 */
export function sortArticlesByTopicRefs(
  articles: Article[],
  refs: TopicArticleRef[],
  articleIdsOrder: string[],
): Article[] {
  const refById = new Map(refs.map((r) => [r.article_id, r]));
  const orderIndex = new Map(articleIdsOrder.map((id, i) => [id, i]));

  return [...articles].sort((a, b) => {
    const ia = orderIndex.get(a.id) ?? 9999;
    const ib = orderIndex.get(b.id) ?? 9999;
    if (ia !== ib) return ia - ib;
    const ra = refById.get(a.id);
    const rb = refById.get(b.id);
    const da = ra?.display_order ?? ra?.rank_in_topic ?? 9999;
    const db = rb?.display_order ?? rb?.rank_in_topic ?? 9999;
    if (da !== db) return da - db;
    const recA = ra?.is_recommended ? 0 : 1;
    const recB = rb?.is_recommended ? 0 : 1;
    return recA - recB;
  });
}

export type CountryArticleGroup = {
  countryCode: string;
  label: string;
  articles: Article[];
};

/**
 * Si au moins 2 pays distincts : sous-groupes par pays. Sinon une seule liste.
 */
export function groupArticlesByCountryIfNeeded(
  articles: Article[],
  labelsFr: Record<string, string> | undefined,
): CountryArticleGroup[] {
  if (articles.length === 0) return [];

  const codes = new Set(
    articles
      .map((a) => (a.country_code ?? "").trim().toUpperCase())
      .filter(Boolean),
  );

  if (codes.size < 2) {
    return [
      {
        countryCode: "",
        label: "",
        articles,
      },
    ];
  }

  const byCountry = new Map<string, Article[]>();
  for (const a of articles) {
    const c = (a.country_code ?? "").trim().toUpperCase() || "—";
    const list = byCountry.get(c) ?? [];
    list.push(a);
    byCountry.set(c, list);
  }

  const sortedCodes = [...codes].sort();
  return sortedCodes.map((code) => {
    const list = byCountry.get(code) ?? [];
    const label =
      labelsFr?.[code] ?? (list[0]?.country?.trim() || code);
    return { countryCode: code, label, articles: list };
  });
}

export function partitionArticlesBySelection(
  orderedArticles: Article[],
  selected: ReadonlySet<string>,
): { retained: Article[]; others: Article[] } {
  const retained: Article[] = [];
  const others: Article[] = [];
  for (const a of orderedArticles) {
    if (selected.has(a.id)) retained.push(a);
    else others.push(a);
  }
  return { retained, others };
}
