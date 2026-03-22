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
