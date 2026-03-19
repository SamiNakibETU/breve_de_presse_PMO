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
}

interface ArticleFiltersProps {
  filters: Filters;
  onChange: (f: Filters) => void;
}

export function ArticleFilters({ filters, onChange }: ArticleFiltersProps) {
  function toggleItem(list: string[], item: string): string[] {
    return list.includes(item)
      ? list.filter((i) => i !== item)
      : [...list, item];
  }

  return (
    <div className="space-y-3 border-b border-border pb-4">
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Pays
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <button
              key={code}
              onClick={() =>
                onChange({ ...filters, countries: toggleItem(filters.countries, code) })
              }
              className={`border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                filters.countries.includes(code)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Type
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => (
            <button
              key={type}
              onClick={() =>
                onChange({ ...filters, types: toggleItem(filters.types, type) })
              }
              className={`border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                filters.types.includes(type)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
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
