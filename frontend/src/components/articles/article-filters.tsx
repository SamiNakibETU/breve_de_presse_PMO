"use client";

const COUNTRIES: Record<string, string> = {
  LB: "Liban", IL: "Israël", IR: "Iran", AE: "EAU",
  SA: "Arabie saoudite", TR: "Turquie", IQ: "Irak", SY: "Syrie",
  QA: "Qatar", JO: "Jordanie", EG: "Égypte",
  US: "États-Unis", GB: "Royaume-Uni", FR: "France",
};

const ARTICLE_TYPES: Record<string, string> = {
  opinion: "Opinion", editorial: "Éditorial", tribune: "Tribune",
  analysis: "Analyse", news: "News", interview: "Interview", reportage: "Reportage",
};

export interface Filters {
  countries: string[];
  types: string[];
  minConfidence: number;
}

interface ArticleFiltersProps {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export function ArticleFilters({ filters, onChange }: ArticleFiltersProps) {
  function toggle(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
  }

  return (
    <div className="space-y-3 border-b border-[#eeede9] pb-4">
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">Pays</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <button
              key={code}
              onClick={() => onChange({ ...filters, countries: toggle(filters.countries, code) })}
              className={`px-2 py-0.5 text-[11px] transition-colors ${
                filters.countries.includes(code)
                  ? "bg-[#1a1a1a] text-white"
                  : "bg-[#f7f7f5] text-[#888] hover:bg-[#eeede9] hover:text-[#1a1a1a]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#888]">Type</p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => (
            <button
              key={type}
              onClick={() => onChange({ ...filters, types: toggle(filters.types, type) })}
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
    </div>
  );
}
