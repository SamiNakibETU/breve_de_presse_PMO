import type { CoverageTargetsResponse } from "@/lib/types";

const FALLBACK_TARGETS = [
  "LB",
  "IL",
  "IR",
  "SA",
  "TR",
  "IQ",
  "QA",
  "AE",
  "KW",
] as const;

const FLAG_EMOJI: Record<string, string> = {
  LB: "🇱🇧",
  IL: "🇮🇱",
  IR: "🇮🇷",
  SA: "🇸🇦",
  TR: "🇹🇷",
  IQ: "🇮🇶",
  QA: "🇶🇦",
  AE: "🇦🇪",
  KW: "🇰🇼",
};

/**
 * Compare les pays des articles sélectionnés aux cibles de couverture (API ou liste par défaut).
 */
export function CoverageGaps({
  selectedCountryCodes,
  targets,
  compact = false,
}: {
  selectedCountryCodes: string[];
  targets?: CoverageTargetsResponse | null;
  /** Barre fixe : libellés plus discrets. */
  compact?: boolean;
}) {
  const codes =
    targets?.country_codes?.length && targets.country_codes.length > 0
      ? targets.country_codes
      : [...FALLBACK_TARGETS];
  const labels = targets?.labels_fr ?? {};

  const covered = new Set(
    selectedCountryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean),
  );
  const missing = codes.filter((c) => !covered.has(c.toUpperCase()));
  const present = codes.filter((c) => covered.has(c.toUpperCase()));

  if (codes.length === 0) {
    return null;
  }

  if (compact) {
    const missingLabels =
      missing.length > 0 ? missing.map((c) => labels[c] ?? c).join(", ") : null;
    return (
      <p className="max-w-2xl text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium text-foreground-subtle">Couverture · </span>
        {present.map((c) => (
          <span key={c} className="mr-1" title={labels[c] ?? c}>
            {FLAG_EMOJI[c] ?? c}
          </span>
        ))}
        {missingLabels ? (
          <span> · À compléter si possible : {missingLabels}.</span>
        ) : selectedCountryCodes.length > 0 ? (
          <span> · Périmètre couvert.</span>
        ) : null}
      </p>
    );
  }

  return (
    <div className="max-w-md border-l border-border pl-3 text-[13px] text-foreground-body">
      <p className="olj-rubric">Couverture régionale (sélection)</p>
      <div
        className="mt-2 flex flex-wrap gap-1.5"
        aria-label="Pays couverts par la sélection"
      >
        {present.map((c) => (
          <span
            key={c}
            title={labels[c] ?? c}
            className="text-[1.15rem] leading-none opacity-90"
          >
            {FLAG_EMOJI[c] ?? c}
          </span>
        ))}
      </div>
      {missing.length > 0 && (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          À compléter si possible : {missing.map((c) => labels[c] ?? c).join(", ")}.
        </p>
      )}
      {missing.length === 0 &&
        present.length === codes.length &&
        selectedCountryCodes.length > 0 && (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Tous les pays cibles sont représentés dans la sélection.
          </p>
        )}
    </div>
  );
}
