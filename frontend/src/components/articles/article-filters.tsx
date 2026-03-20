"use client";

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
  news: "News",
  interview: "Interview",
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

export function ArticleFilters({
  filters,
  onChange,
  countsByCountry,
}: ArticleFiltersProps) {
  function toggle(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
  }

  return (
    <div className="space-y-3 border-b border-[#eeede9] pb-4">
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Pays
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(COUNTRIES).map(([code, name]) => {
            const c = countsByCountry?.[code];
            const label = c != null ? `${name} (${c})` : name;
            return (
              <button
                key={code}
                onClick={() =>
                  onChange({ ...filters, countries: toggle(filters.countries, code) })
                }
                className={`px-2 py-0.5 text-[11px] transition-colors ${
                  filters.countries.includes(code)
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-[#f7f7f5] text-[#888] hover:bg-[#eeede9] hover:text-[#1a1a1a]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">
          Type
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => (
            <button
              key={type}
              onClick={() =>
                onChange({ ...filters, types: toggle(filters.types, type) })
              }
              className={`px-2 py-0.5 text-[11px] transition-colors ${
                filters.types.includes(type)
                  ? "bg-[#1a1a1a] text-white"
                  : "bg-[#f7f7f5] text-[#888] hover:bg-[#eeede9] hover:text-[#1a1a1a]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-[#eeede9] pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#666]">
          <input
            type="checkbox"
            checked={filters.includeLowQuality}
            onChange={(e) =>
              onChange({ ...filters, includeLowQuality: e.target.checked })
            }
            className="border-[#ccc]"
          />
          Inclure basse qualité (&lt; 50 % confiance)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#666]">
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
            className="border-[#ccc]"
          />
          Masquer reprises / syndiqués
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#666]">
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
            className="border-[#ccc]"
          />
          Vue groupée (+N reprises sur l’article source)
        </label>
      </div>
      {filters.hideSyndicated && (
        <p className="text-[10px] leading-snug text-[#aaa]">
          Par défaut, les reprises d’agence ne sont pas listées. Décochez « Masquer
          reprises » pour tout afficher.
        </p>
      )}
    </div>
  );
}
