/** Pastilles discrètes : repère géographique (codes ISO2). */

function hashHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % 42;
}

/** Teintes par code ISO2 ; repli hash pour codes hors carte. */
export function countryDotColor(code: string): string {
  const u = code.trim().toUpperCase();
  const byCode: Record<string, string> = {
    LB: "var(--color-foreground)",
    IL: "var(--color-foreground-muted)",
    IR: "var(--color-foreground-subtle)",
    SY: "var(--color-muted-foreground)",
    TR: "var(--color-accent)",
    IQ: "var(--color-warning)",
    QA: "var(--color-foreground-body)",
    SA: "var(--color-foreground-subtle)",
    AE: "var(--color-muted-foreground)",
    KW: "var(--color-foreground-muted)",
    JO: "var(--color-foreground-body)",
    EG: "var(--color-foreground-subtle)",
    OM: "var(--color-muted-foreground)",
    BH: "var(--color-foreground-muted)",
    DZ: "var(--color-foreground)",
    ME: "var(--color-accent)",
    XX: "var(--color-muted-foreground)",
  };
  if (byCode[u]) return byCode[u];
  const hue = hashHue(u);
  return `hsl(${hue * 8} 28% 42%)`;
}

export function ClusterCountryStrip({
  countries,
  maxDots = 10,
  labelForCode,
}: {
  /** Codes pays ISO2 */
  countries: string[];
  maxDots?: number;
  /** Libellés FR pour title accessibilité (optionnel). */
  labelForCode?: (code: string) => string;
}) {
  if (countries.length === 0) return null;
  const dots = countries.slice(0, maxDots);
  const extra = countries.length - dots.length;
  const title = labelForCode
    ? dots.map((c) => labelForCode(c)).join(", ")
    : dots.join(", ");

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
