"use client";

import Link from "next/link";
import { useState } from "react";
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
  activeEditionId = null,
}: ArticleFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="olj-sidebar-filter space-y-5 border-b border-border-light pb-4 lg:border-0 lg:pb-0">
      {activeEditionId ? (
        <div className="rounded-md border border-accent/20 bg-accent/5 px-3 py-2.5 text-[12px] leading-snug text-foreground-body">
          <span className="font-semibold text-foreground">Corpus de l’édition</span>{" "}
          : liste limitée à cette édition.{" "}
          <Link
            href="/articles"
            className="font-medium text-accent underline underline-offset-2 hover:opacity-90"
          >
            Vue large (période glissante)
          </Link>
        </div>
      ) : null}
      <div>
        <p className="olj-rubric mb-2">Pays</p>
        <ul className="max-h-[min(14rem,40vh)] space-y-1.5 overflow-y-auto lg:max-h-[min(18rem,50vh)]">
          {Object.entries(COUNTRIES).map(([code, name]) => {
            const c = countsByCountry?.[code];
            const label = c != null ? `${name} (${c})` : name;
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
      </div>

      <div>
        <p className="olj-rubric mb-2">Type</p>
        <ul className="space-y-1.5">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => {
            const on = filters.types.includes(type);
            return (
              <li key={type}>
                <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-foreground-body">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      onChange({
                        ...filters,
                        types: toggle(filters.types, type),
                      })
                    }
                    className="olj-focus mt-0.5 size-[14px] shrink-0 border-border"
                  />
                  <span className={on ? "font-medium text-foreground" : ""}>
                    {label}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="text-[12px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? "Masquer les filtres avancés" : "Plus de filtres"}
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
            Inclure textes à faible confiance de traduction
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
            Masquer les reprises
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
            Regrouper les reprises sous l’article source
          </label>
        </div>
      ) : null}

      {advancedOpen && filters.hideSyndicated && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          Par défaut, les reprises ne sont pas listées. Décochez « Masquer les
          reprises » pour tout afficher.
        </p>
      )}
    </div>
  );
}

/** Liens texte discrets pour statut / tri (barre latérale). */
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
  sortOptions: readonly { key: string; label: string }[];
}) {
  return (
    <div className="space-y-5">
      <nav className="space-y-1.5" aria-label="Filtre statut">
        <p className="olj-rubric">Statut</p>
        <ul className="space-y-1">
          {statusOptions.map(({ key, label }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => onStatusChange(key)}
                className={cn(
                  "block w-full text-left text-[12px] transition-colors",
                  statusFilter === key
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <nav className="space-y-1.5" aria-label="Tri">
        <p className="olj-rubric">Tri</p>
        <ul className="space-y-1">
          {sortOptions.map(({ key, label }) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSortChange(key)}
                className={cn(
                  "block w-full text-left text-[12px] transition-colors",
                  sortBy === key
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
