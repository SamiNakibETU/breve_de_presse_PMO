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
