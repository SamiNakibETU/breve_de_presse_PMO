"use client";

const COUNTRIES: Record<string, string> = {
  LB: "Liban",
  IL: "Israël",
  IR: "Iran",
  AE: "EAU",
  SA: "Arabie Saoudite",
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
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
          Pays
        </label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <button
              key={code}
              onClick={() =>
                onChange({
                  ...filters,
                  countries: toggleItem(filters.countries, code),
                })
              }
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filters.countries.includes(code)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-border"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
          Type d&apos;article
        </label>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(ARTICLE_TYPES).map(([type, label]) => (
            <button
              key={type}
              onClick={() =>
                onChange({
                  ...filters,
                  types: toggleItem(filters.types, type),
                })
              }
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                filters.types.includes(type)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
          Confiance min. : {Math.round(filters.minConfidence * 100)}%
        </label>
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
          className="w-full accent-primary"
        />
      </div>
    </div>
  );
}
