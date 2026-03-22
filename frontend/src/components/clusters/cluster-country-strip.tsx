/** Pastilles discrètes : repère géographique sans liste de drapeaux (complété par le texte à côté). */

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h % 42;
}

/** Teintes sourdes, lisibles sur fond papier (brief : peu de couleurs criardes). */
export function countryDotColor(name: string): string {
  const presets: Record<string, string> = {
    Liban: "var(--color-foreground)",
    Israël: "var(--color-foreground-muted)",
    Iran: "var(--color-foreground-subtle)",
    Syrie: "var(--color-muted-foreground)",
    Turquie: "var(--color-accent)",
    Irak: "var(--color-warning)",
    Qatar: "var(--color-foreground-body)",
    "Arabie Saoudite": "var(--color-foreground-subtle)",
    "Émirats Arabes Unis": "var(--color-muted-foreground)",
    EAU: "var(--color-muted-foreground)",
    Koweït: "var(--color-foreground-muted)",
    Jordanie: "var(--color-foreground-body)",
    Égypte: "var(--color-foreground-subtle)",
    Oman: "var(--color-muted-foreground)",
    Bahreïn: "var(--color-foreground-muted)",
    Algérie: "var(--color-foreground)",
    régional: "var(--color-accent)",
  };
  if (presets[name]) return presets[name];
  const hue = hashHue(name);
  return `hsl(${hue * 8} 28% 42%)`;
}

export function ClusterCountryStrip({
  countries,
  maxDots = 10,
}: {
  countries: string[];
  maxDots?: number;
}) {
  if (countries.length === 0) return null;
  const dots = countries.slice(0, maxDots);
  const extra = countries.length - dots.length;
  const title = countries.join(", ");

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1"
      title={title}
    >
      <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Couverture
      </span>
      <span className="flex items-center gap-1" aria-hidden>
        {dots.map((c) => (
          <span
            key={c}
            className="inline-block h-2 w-2 shrink-0 rounded-full border border-border/60"
            style={{ backgroundColor: countryDotColor(c) }}
          />
        ))}
        {extra > 0 ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">+{extra}</span>
        ) : null}
      </span>
    </div>
  );
}
