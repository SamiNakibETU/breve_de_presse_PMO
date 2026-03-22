export function CoverageGaps({ countries }: { countries: string[] }) {
  if (countries.length === 0) {
    return null;
  }
  return (
    <div className="border-l-2 border-accent/40 pl-3 text-[13px] text-foreground-body">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Couverture
      </span>
      <p className="mt-1">
        Pays absents ou peu couverts : {countries.join(", ")}.
      </p>
    </div>
  );
}
