/** Date calendaire YYYY-MM-DD extraite d’un chemin `/edition/…` (sommaire, composition, fiche sujet). */
export function editionCalendarDateFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/edition\/(\d{4}-\d{2}-\d{2})(?:\/|$)/);
  return m?.[1] ?? null;
}
