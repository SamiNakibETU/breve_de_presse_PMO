/** Lien vers la page Revue avec une liste d’identifiants d’articles (max 10 côté UI). */
export function reviewPagePath(articleIds: readonly string[]): string {
  const ids = articleIds.slice(0, 10);
  if (ids.length === 0) return "/review";
  const q = new URLSearchParams();
  q.set("ids", ids.join(","));
  return `/review?${q.toString()}`;
}

export function parseArticleIdsParam(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}
