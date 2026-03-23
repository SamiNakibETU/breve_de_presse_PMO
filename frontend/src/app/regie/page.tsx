import Link from "next/link";

const sections: { href: string; title: string; blurb: string }[] = [
  {
    href: "/regie/sources",
    title: "Sources",
    blurb: "État des médias, dernières collectes et alertes.",
  },
  {
    href: "/dashboard",
    title: "Sujets automatiques",
    blurb: "Vue technique : regroupements et inventaire.",
  },
  {
    href: "/regie/pipeline",
    title: "Collecte et traduction",
    blurb: "Rapports par étape (collecte, dédoublonnage, regroupement…).",
  },
  {
    href: "/regie/dedup",
    title: "Dédoublonnage",
    blurb: "Étapes de fusion et signalements.",
  },
  {
    href: "/regie/clustering",
    title: "Regroupements",
    blurb: "Paramètres et documentation — indicateurs dans les journaux.",
  },
  {
    href: "/regie/curator",
    title: "Curateur",
    blurb: "Historique des propositions de sujets (appels automatisés).",
  },
  {
    href: "/regie/logs",
    title: "Journaux",
    blurb: "Traces techniques et journal des opérations.",
  },
];

export default function RegieHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Administration
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-foreground-body">
          Outils réservés à l’équipe technique et à la maintenance. Les vues
          s’appuient sur les tables{" "}
          <code className="text-[12px]">pipeline_debug_logs</code>,{" "}
          <code className="text-[12px]">llm_call_logs</code> et l’API{" "}
          <code className="text-[12px]">/api/regie/*</code> (authentification requise).
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block border border-border-light bg-card p-4 transition-colors hover:bg-muted/60"
            >
              <h2 className="font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
                {s.title}
              </h2>
              <p className="mt-2 text-[12px] leading-relaxed text-foreground-body">
                {s.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:underline">
          Retour à l’accueil (sommaire du jour)
        </Link>
        .
      </p>
    </div>
  );
}
