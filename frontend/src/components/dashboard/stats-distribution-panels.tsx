"use client";

import { useMemo } from "react";
import { COUNTRY_LABELS_FR } from "@/lib/country-labels-fr";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { UI_SURFACE_PANEL } from "@/lib/ui-surface-classes";

const LANG_LABELS: Record<string, string> = {
  ar: "Arabe",
  en: "Anglais",
  fr: "Français",
  he: "Hébreu",
  fa: "Persan",
  tr: "Turc",
  ku: "Kurde",
};

function ProportionBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className="mx-2 h-2 min-w-[3.5rem] max-w-[min(8rem,28vw)] flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-muted)_55%,transparent)]"
      aria-hidden
    >
      <div
        className="h-full rounded-full bg-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

type CountryRow = {
  key: string;
  label: string;
  count: number;
  isoCode?: string;
};

type LangRow = { key: string; label: string; count: number };

/**
 * Pays et langues : barres de proportion, drapeaux quand les codes ISO2 sont disponibles.
 */
export function StatsDistributionPanels({
  byCountry,
  byLanguage,
  byCountryCode,
  countryLabelsFr,
}: {
  byCountry: Record<string, number>;
  byLanguage: Record<string, number>;
  byCountryCode?: Record<string, number> | null;
  countryLabelsFr?: Record<string, string> | null;
}) {
  const countryRows = useMemo((): CountryRow[] => {
    const codeMap = byCountryCode;
    if (codeMap && Object.keys(codeMap).length > 0) {
      return Object.entries(codeMap)
        .map(([code, count]) => {
          const u = code.trim().toUpperCase();
          return {
            key: u,
            label: countryLabelsFr?.[code] ?? COUNTRY_LABELS_FR[u] ?? code,
            count,
            isoCode: u,
          };
        })
        .sort((a, b) => b.count - a.count);
    }
    return Object.entries(byCountry)
      .map(([label, count]) => ({ key: label, label, count }))
      .sort((a, b) => b.count - a.count);
  }, [byCountry, byCountryCode, countryLabelsFr]);

  const langRows = useMemo((): LangRow[] => {
    return Object.entries(byLanguage)
      .map(([lang, count]) => {
        const k = lang.toLowerCase();
        return {
          key: lang,
          label: LANG_LABELS[k] ?? lang.toUpperCase(),
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [byLanguage]);

  const maxCountry = countryRows[0]?.count ?? 0;
  const maxLang = langRows[0]?.count ?? 0;

  if (countryRows.length === 0 && langRows.length === 0) {
    return null;
  }

  return (
    <div
      className="grid gap-6 sm:grid-cols-2"
      role="group"
      aria-label="Répartitions pays et langues"
    >
      {countryRows.length > 0 ? (
        <section className={UI_SURFACE_PANEL}>
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Pays
          </h3>
          <ul className="olj-scrollbar-none max-h-[min(22rem,55vh)] space-y-0 overflow-y-auto pr-1">
            {countryRows.map((row) => {
              const flag = row.isoCode
                ? (REGION_FLAG_EMOJI[row.isoCode] ?? null)
                : null;
              return (
                <li
                  key={row.key}
                  className="flex items-center gap-1 rounded-md border-b border-border-light py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--color-muted)_22%,transparent)]"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {flag ? (
                      <span className="shrink-0 text-[1.05rem] leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}
                    <span className="min-w-0 truncate text-foreground-body">
                      {row.label}
                    </span>
                  </span>
                  <ProportionBar value={row.count} max={maxCountry} />
                  <span className="w-9 shrink-0 text-right tabular-nums text-foreground sm:w-10">
                    {row.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {langRows.length > 0 ? (
        <section className={UI_SURFACE_PANEL}>
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Langues
          </h3>
          <ul className="olj-scrollbar-none max-h-[min(22rem,55vh)] space-y-0 overflow-y-auto pr-1">
            {langRows.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-1 rounded-md border-b border-border-light py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--color-muted)_22%,transparent)]"
              >
                <span className="min-w-0 flex-1 truncate text-foreground-body">
                  {row.label}
                </span>
                <ProportionBar value={row.count} max={maxLang} />
                <span className="w-9 shrink-0 text-right tabular-nums text-foreground sm:w-10">
                  {row.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
