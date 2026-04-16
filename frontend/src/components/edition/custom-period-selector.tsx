"use client";

import { useState } from "react";
import { CustomPeriodForm } from "@/components/edition/custom-period-form";

export const CUSTOM_PERIOD_TRIGGER_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:border-accent/30 hover:bg-accent/5 hover:text-accent";

/**
 * Bloc autonome (période + aide) — conservé pour réutilisation hors bandeau méta.
 */
export function CustomPeriodSelector({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className={`space-y-1 ${className}`}>
        <button type="button" onClick={() => setOpen(true)} className={CUSTOM_PERIOD_TRIGGER_CLASS}>
          <span className="text-[13px]" aria-hidden>
            +
          </span>
          Période personnalisée
        </button>
        <p className="max-w-lg text-[10px] leading-snug text-muted-foreground">
          Crée une édition sur des dates libres, lance l&apos;analyse puis ouvre automatiquement le{" "}
          <strong className="font-medium text-foreground-body">sommaire du jour de fin</strong> (URL{" "}
          <code className="rounded bg-muted/50 px-0.5 text-[9px]">/edition/AAAA-MM-JJ</code>
          ). Retrouvez-la comme n&apos;importe quelle édition via le calendrier ou le rail de dates.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <CustomPeriodForm onClose={() => setOpen(false)} />
    </div>
  );
}
