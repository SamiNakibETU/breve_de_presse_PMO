"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { REGION_FLAG_EMOJI } from "@/lib/region-flag-emoji";
import { cn } from "@/lib/utils";

const COUNTRIES: Record<string, string> = {
  LB: "Liban",
  IL: "Israël",
  IR: "Iran",
  AE: "EAU",
  SA: "Arabie saoudite",
  TR: "Turquie",
  IQ: "Irak",
  SY: "Syrie",
  QA: "Qatar",
  JO: "Jordanie",
  EG: "Égypte",
  KW: "Koweït",
  BH: "Bahreïn",
  OM: "Oman",
  DZ: "Algérie",
  ME: "Régional",
  US: "États-Unis",
  GB: "Royaume-Uni",
  FR: "France",
};

const ARTICLE_TYPES: Record<string, string> = {
  opinion: "Opinion",
  editorial: "Éditorial",
  tribune: "Tribune",
  analysis: "Analyse",
  news: "Actualité",
  interview: "Entretien",
  reportage: "Reportage",
};

/** Ordre d’affichage des puces type (sidebar). */
const ARTICLE_TYPE_ORDER = [
  "opinion",
  "editorial",
  "tribune",
  "analysis",
  "news",
  "interview",
  "reportage",
] as const satisfies readonly (keyof typeof ARTICLE_TYPES)[];

const TYPE_CHIP_ON =
  "border-[color-mix(in_srgb,var(--color-accent)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_11%,transparent)] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.04)]";
const TYPE_CHIP_OFF =
  "border-border/55 bg-[color-mix(in_srgb,var(--color-muted)_18%,transparent)] text-muted-foreground hover:border-border hover:text-foreground";

const SELECT_FIELD =
  "olj-focus w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-[12px] text-foreground shadow-[0_1px_0_rgba(0,0,0,0.03)]";

export interface Filters {
  countries: string[];
  types: string[];
  minConfidence: number;
  includeLowQuality: boolean;
  hideSyndicated: boolean;
  /** API group_syndicated : entrées canoniques + compteur de reprises (implique masquage des lignes reprise) */
  groupSyndicated: boolean;
}

interface ArticleFiltersProps {
  filters: Filters;
  onChange: (f: Filters) => void;
  countsByCountry?: Record<string, number> | null;
  countryLabelsFr?: Record<string, string> | null;
  /** Filtre passé par l’URL (`edition_id`) depuis le sommaire d’édition. */
  activeEditionId?: string | null;
}

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export function ArticleFilters({
  filters,
  onChange,
  countsByCountry,
  countryLabelsFr = null,
  activeEditionId = null,
}: ArticleFiltersProps) {
  const countrySearchId = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");

  const countryRows = useMemo(() => {
    const hasCounts =
      countsByCountry != null && Object.keys(countsByCountry).length > 0;
    const pairs: [string, number | null][] = hasCounts
      ? Object.entries(countsByCountry!).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"),
        )
      : (Object.keys(COUNTRIES) as string[]).map((code) => [code, null]);
    return pairs.map(([code, cnt]) => {
      const base =
        countryLabelsFr?.[code]?.trim() || COUNTRIES[code] || code;
      const label = cnt != null ? `${base} (${cnt})` : base;
      return { code, label };
    });
  }, [countsByCountry, countryLabelsFr]);

  const countryRowsFiltered = useMemo(() => {
    const q = countryQuery.trim().toLowerCase().normalize("NFD");
    if (!q) return countryRows;
    return countryRows.filter(({ label }) =>
      label
        .toLowerCase()
        .normalize("NFD")
        .includes(q),
    );
  }, [countryRows, countryQuery]);

  return (
    <div className="olj-sidebar-filter space-y-5 border-b border-border-light pb-4 lg:border-0 lg:pb-0">
      {activeEditionId ? (
        <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] leading-snug text-foreground-body">
          <span className="font-semibold text-foreground">Édition liée</span>
          {" · "}
          <Link
            href="/articles"
            className="font-medium text-accent underline underline-offset-2 hover:opacity-90"
          >
            Liste sans édition
          </Link>
        </div>
      ) : null}
      <div>
        <label className="mb-2 block" htmlFor={countrySearchId}>
          <span className="olj-rubric">Pays</span>
          <input
            id={countrySearchId}
            type="search"
            value={countryQuery}
            onChange={(e) => setCountryQuery(e.target.value)}
            placeholder="Filtrer la liste…"
            autoComplete="off"
            className={`${SELECT_FIELD} mt-1.5`}
          />
        </label>
        <ul className="max-h-[min(14rem,40vh)] space-y-1.5 overflow-y-auto lg:max-h-[min(18rem,50vh)]">
          {countryRowsFiltered.map(({ code, label }) => {
            const on = filters.countries.includes(code);
            const flag = REGION_FLAG_EMOJI[code];
            return (
              <li key={code}>
                <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-foreground-body">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({
                        ...filters,
                        countries: toggle(filters.countries, code),
                      })
                    }
                    className="olj-focus mt-0.5 size-[14px] shrink-0 border-border"
                  />
                  <span
                    className={`flex items-center gap-2 ${on ? "font-medium text-foreground" : ""}`}
                  >
                    {flag ? (
                      <span className="text-[1rem] leading-none" aria-hidden>
                        {flag}
                      </span>
                    ) : null}
                    <span>{label}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {countryQuery.trim() && countryRowsFiltered.length === 0 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">Aucun pays ne correspond.</p>
        ) : null}
      </div>

      <div>
        <p className="olj-rubric mb-2">Type</p>
        <div className="flex flex-wrap gap-1.5">
          {ARTICLE_TYPE_ORDER.map((type) => {
            const label = ARTICLE_TYPES[type];
            const on = filters.types.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    types: toggle(filters.types, type),
                  })
                }
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight transition-[color,background-color,border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-accent)_50%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]",
                  on ? TYPE_CHIP_ON : TYPE_CHIP_OFF,
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {filters.types.length === 0 ? (
          <p className="mt-2 text-[10px] text-muted-foreground/90">Aucun filtre type : tous les types.</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="text-[12px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? "Masquer options" : "Options"}
      </button>

      {advancedOpen ? (
        <div className="space-y-3 border-t border-border-light pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground-body">
            <input
              type="checkbox"
              checked={filters.includeLowQuality}
              onChange={(e) =>
                onChange({ ...filters, includeLowQuality: e.target.checked })
              }
              className="border-border accent-foreground"
            />
            Inclure traductions peu fiables
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground-body">
            <input
              type="checkbox"
              checked={filters.hideSyndicated}
              onChange={(e) => {
                const v = e.target.checked;
                onChange({
                  ...filters,
                  hideSyndicated: v,
                  groupSyndicated: v ? filters.groupSyndicated : false,
                });
              }}
              className="border-border accent-foreground"
            />
            Masquer reprises
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground-body">
            <input
              type="checkbox"
              checked={filters.groupSyndicated}
              onChange={(e) => {
                const v = e.target.checked;
                onChange({
                  ...filters,
                  groupSyndicated: v,
                  hideSyndicated: v ? true : filters.hideSyndicated,
                });
              }}
              className="border-border accent-foreground"
            />
            Regrouper reprises (sous la source)
          </label>
        </div>
      ) : null}

      {advancedOpen && filters.hideSyndicated && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          Reprises masquées par défaut — décocher pour tout afficher.
        </p>
      )}
    </div>
  );
}

const MOBILE_CHIP_ON =
  "border-foreground bg-foreground text-background shadow-[0_1px_0_rgba(0,0,0,0.04)]";
const MOBILE_CHIP_OFF =
  "border-border/55 bg-background text-muted-foreground hover:border-border hover:text-foreground";

/** Filtres statut + tri en pastilles horizontales (mobile / étroit). */
export function ArticlesMobileFilterRow({
  statusFilter,
  sortBy,
  onStatusChange,
  onSortChange,
  statusOptions,
  sortOptions,
}: {
  statusFilter: string;
  sortBy: string;
  onStatusChange: (key: string) => void;
  onSortChange: (key: string) => void;
  statusOptions: readonly { key: string; label: string }[];
  sortOptions: readonly { key: string; label: string; title?: string }[];
}) {
  return (
    <div className="lg:hidden w-full min-w-0 rounded-lg border border-border/50 bg-muted/10 px-2 py-2">
      <div className="olj-scrollbar-none flex gap-1.5 overflow-x-auto pb-0.5">
        {statusOptions.map(({ key, label }) => (
          <button
            key={`mob-st-${key}`}
            type="button"
            onClick={() => onStatusChange(key)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors [transition-duration:var(--duration-fast)] ${statusFilter === key ? MOBILE_CHIP_ON : MOBILE_CHIP_OFF}`}
          >
            {label}
          </button>
        ))}
        <span
          className="mx-0.5 w-px shrink-0 self-stretch bg-border/60"
          aria-hidden
        />
        {sortOptions.map(({ key, label, title }) => (
          <button
            key={`mob-so-${key}`}
            type="button"
            title={title}
            onClick={() => onSortChange(key)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors [transition-duration:var(--duration-fast)] ${sortBy === key ? MOBILE_CHIP_ON : MOBILE_CHIP_OFF}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Statut et tri compacts (barre latérale). */
export function ArticleFilterNavLinks({
  statusFilter,
  sortBy,
  onStatusChange,
  onSortChange,
  statusOptions,
  sortOptions,
}: {
  statusFilter: string;
  sortBy: string;
  onStatusChange: (key: string) => void;
  onSortChange: (key: string) => void;
  statusOptions: readonly { key: string; label: string }[];
  sortOptions: readonly { key: string; label: string; title?: string }[];
}) {
  const uid = useId();
  const statusId = `olj-articles-filter-status-${uid}`;
  const sortId = `olj-articles-filter-sort-${uid}`;
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={statusId} className="olj-rubric block">
          Statut
        </label>
        <select
          id={statusId}
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value)}
          className={SELECT_FIELD}
        >
          {statusOptions.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={sortId} className="olj-rubric block">
          Tri
        </label>
        <select
          id={sortId}
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          className={SELECT_FIELD}
        >
          {sortOptions.map(({ key, label, title }) => (
            <option key={key} value={key} title={title}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
