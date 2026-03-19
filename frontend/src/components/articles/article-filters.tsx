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
    <div className="space-y-4 border-b border-border pb-4">
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Pays
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <button
              key={code}
              onClick={() =>
                onChange({
                  ...filters,
                  countries: toggleItem(filters.countries, code),
                })
              }
              className={`border px-2 py-1 text-[12px] font-medium transition-colors ${
                filters.countries.includes(code)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-light text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Type
        </p>
        <div className="flex flex-wrap gap-1">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => (
            <button
              key={type}
              onClick={() =>
                onChange({
                  ...filters,
                  types: toggleItem(filters.types, type),
                })
              }
              className={`border px-2 py-1 text-[12px] font-medium transition-colors ${
                filters.types.includes(type)
                  ? "border-foreground bg-foreground text-background"
                  : "border-border-light text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Confiance min.
        </p>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minConfidence * 100}
          onChange={(e) =>
            onChange({
              ...filters,
              minConfidence: parseInt(e.target.value, 10) / 100,
            })
          }
          className="w-32 accent-accent"
        />
        <span className="tabular-nums text-[12px] text-muted-foreground">
          {Math.round(filters.minConfidence * 100)} %
        </span>
      </div>
    </div>
  );
}
