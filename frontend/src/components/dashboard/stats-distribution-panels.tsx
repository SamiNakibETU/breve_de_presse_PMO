"use client";

const LANG_LABELS: Record<string, string> = {
  ar: "Arabe",
  en: "Anglais",
  fr: "Français",
  he: "Hébreu",
  fa: "Persan",
  tr: "Turc",
  ku: "Kurde",
};

/**
 * Pays et langues côte à côte — listes sobres, sans cartes lourdes.
 */
export function StatsDistributionPanels({
  byCountry,
  byLanguage,
}: {
  byCountry: Record<string, number>;
  byLanguage: Record<string, number>;
}) {
  const countryEntries = Object.entries(byCountry).sort(([, a], [, b]) => b - a);
  const langEntries = Object.entries(byLanguage).sort(([, a], [, b]) => b - a);

  if (countryEntries.length === 0 && langEntries.length === 0) {
    return null;
  }

  return (
    <div
      className="grid gap-6 sm:grid-cols-2"
      role="group"
      aria-label="Répartitions pays et langues"
    >
      {countryEntries.length > 0 ? (
        <section className="border-t border-border pt-4">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Pays
          </h3>
          <ul className="max-h-[min(22rem,55vh)] space-y-0 overflow-y-auto">
            {countryEntries.map(([country, count]) => (
              <li
                key={country}
                className="flex items-baseline justify-between gap-3 border-b border-border-light py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 text-foreground-body">{country}</span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {langEntries.length > 0 ? (
        <section className="border-t border-border pt-4">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Langues
          </h3>
          <ul className="max-h-[min(22rem,55vh)] space-y-0 overflow-y-auto">
            {langEntries.map(([lang, count]) => (
              <li
                key={lang}
                className="flex items-baseline justify-between gap-3 border-b border-border-light py-2 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 text-foreground-body">
                  {LANG_LABELS[lang] || lang.toUpperCase()}
                </span>
                <span className="shrink-0 tabular-nums text-foreground">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
