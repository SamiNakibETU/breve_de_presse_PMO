/** Décale une date calendaire `YYYY-MM-DD` (interprétée en UTC) de `deltaDays`. */
export function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Date locale (YYYY-MM-DD) au fuseau Asia/Beirut — aligné sur le sommaire édition. */
export function todayBeirutIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 10);
}

/** Libellé long FR pour « aujourd’hui » au fuseau Beyrouth (Panorama, en-têtes). */
export function formatTodayBeirutLongFr(): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Asia/Beirut",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}
