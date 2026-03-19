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

function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export function ArticleFilters({ filters, onChange }: ArticleFiltersProps) {
  return (
    <div className="mb-10 flex flex-wrap items-baseline gap-x-8 gap-y-4 font-mono">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Pays
        </span>
        {Object.entries(COUNTRIES).map(([code, name]) => {
          const active = filters.countries.includes(code);
          return (
            <button
              key={code}
              onClick={() =>
                onChange({ ...filters, countries: toggleItem(filters.countries, code) })
              }
              className={`text-[11px] tracking-wider transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Type
        </span>
        {Object.entries(ARTICLE_TYPES).map(([type, label]) => {
          const active = filters.types.includes(type);
          return (
            <button
              key={type}
              onClick={() =>
                onChange({ ...filters, types: toggleItem(filters.types, type) })
              }
              className={`text-[11px] tracking-wider transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline gap-3">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Conf.
        </span>
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
          className="w-24 accent-foreground"
        />
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {Math.round(filters.minConfidence * 100)}%
        </span>
      </div>
    </div>
  );
}
