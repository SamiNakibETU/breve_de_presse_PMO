"use client";

import { useState } from "react";
import { AnalyticsSection } from "@/components/dashboard/analytics-section";

export default function RegieAnalyticsPage() {
  const [days, setDays] = useState(7);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Analytique interne
        </h1>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          Page non listée dans le menu principal : usage HTTP de l’API et agrégats issus des journaux
          persistés. Pour le détail des coûts réels par fournisseur, il faut encore consolider les appels
          traduction / embeddings (voir encadré ci-dessous).
        </p>
      </header>
      <AnalyticsSection
        days={days}
        onDaysChange={setDays}
        showSectionHeading={false}
      />
    </div>
  );
}
