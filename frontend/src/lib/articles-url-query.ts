/**
 * Paramètres d’URL de la page Articles et liens jour pour Panorama (évite imports circulaires).
 */

export function mergeArticlesQuery(
  base: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): string {
  const p = new URLSearchParams(base.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") {
      p.delete(k);
    } else {
      p.set(k, v);
    }
  }
  return p.toString();
}

export function buildPanoramaDayHref(
  pathname: string,
  searchParams: URLSearchParams,
  iso: string,
): string {
  const p = new URLSearchParams(searchParams.toString());
  p.set("date", iso);
  p.delete("date_from");
  p.delete("date_to");
  const qs = p.toString();
  return qs ? `${pathname}?${qs}` : `${pathname}?date=${iso}`;
}
