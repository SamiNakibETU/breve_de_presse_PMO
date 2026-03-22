import Link from "next/link";

const sections: { href: string; title: string; blurb: string }[] = [
  {
    href: "/regie/sources",
    title: "Santé des sources",
    blurb: "Tiers P0/P1/P2, derniers articles collectés, état.",
  },
  {
    href: "/dashboard",
    title: "Sujets du jour",
    blurb: "Vue technique : traitements, sujets thématiques et inventaire.",
  },
  {
    href: "/regie/pipeline",
    title: "Étapes pipeline",
    blurb: "Rapports JSON par étape (collecte, dédup, regroupement…) depuis la base.",
  },
  {
    href: "/regie/dedup",
    title: "Déduplication",
    blurb: "Filtre sur les étapes dédup + signalements faux positifs.",
  },
  {
    href: "/regie/clustering",
    title: "Clustering",
    blurb: "Paramètres et documentation — métriques dans les logs pipeline.",
  },
  {
    href: "/regie/curator",
    title: "Curateur",
    blurb: "Historique des appels LLM du curateur (prompt dédié).",
  },
  {
    href: "/regie/logs",
    title: "Logs",
    blurb: "Vue combinée : étapes pipeline et journal des appels LLM.",
  },
];

export default function RegieHubPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Régie technique
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-foreground-body">
          Espace séparé du chemin critique (composition). Les vues listées
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
