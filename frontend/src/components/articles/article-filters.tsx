"use client";

import { useState } from "react";
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
}

function toggle(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export function ArticleFilters({
  filters,
  onChange,
  countsByCountry,
}: ArticleFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="space-y-4 border-b border-border-light pb-4">
      <div>
        <p className="olj-rubric mb-2">Pays</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(COUNTRIES).map(([code, name]) => {
            const c = countsByCountry?.[code];
            const label = c != null ? `${name} (${c})` : name;
            const on = filters.countries.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() =>
                  onChange({ ...filters, countries: toggle(filters.countries, code) })
                }
                className={cn(
                  "border-b-2 pb-0.5 text-[11px] transition-colors",
                  on
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="olj-rubric mb-2">Type</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => {
            const on = filters.types.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() =>
                  onChange({ ...filters, types: toggle(filters.types, type) })
                }
                className={cn(
                  "border-b-2 pb-0.5 text-[11px] transition-colors",
                  on
                    ? "border-foreground font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
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
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border-light pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-foreground-body">
            <input
              type="checkbox"
              checked={filters.includeLowQuality}
              onChange={(e) =>
                onChange({ ...filters, includeLowQuality: e.target.checked })
              }
              className="border-border text-foreground accent-foreground"
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
