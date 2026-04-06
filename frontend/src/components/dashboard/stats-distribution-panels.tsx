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
 * Pays et langues toujours visibles côte à côte (pas d’accordéons exclusifs).
 * Vue Panorama : deux colonnes stables.
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
      className="grid gap-4 sm:grid-cols-2"
      role="group"
      aria-label="Répartitions pays et langues"
    >
      {countryEntries.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <h3 className="border-b border-border-light px-3 py-2.5 font-[family-name:var(--font-serif)] text-[13px] font-semibold text-foreground">
            Pays
          </h3>
          <div className="max-h-[min(22rem,55vh)] overflow-y-auto px-3 pb-2 pt-1">
            {countryEntries.map(([country, count]) => (
              <div
                key={country}
                className="flex items-baseline justify-between border-b border-border-light py-2 text-[12px] last:border-b-0"
              >
                <span className="text-foreground-body">{country}</span>
                <span className="tabular-nums font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {langEntries.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <h3 className="border-b border-border-light px-3 py-2.5 font-[family-name:var(--font-serif)] text-[13px] font-semibold text-foreground">
            Langues
          </h3>
          <div className="max-h-[min(22rem,55vh)] overflow-y-auto px-3 pb-2 pt-1">
            {langEntries.map(([lang, count]) => (
              <div
                key={lang}
                className="flex items-baseline justify-between border-b border-border-light py-2 text-[12px] last:border-b-0"
              >
                <span className="text-foreground-body">
                  {LANG_LABELS[lang] || lang.toUpperCase()}
                </span>
                <span className="tabular-nums font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
