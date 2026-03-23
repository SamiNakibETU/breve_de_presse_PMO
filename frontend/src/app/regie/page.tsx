import Link from "next/link";

const sections: { href: string; title: string; blurb: string }[] = [
  {
    href: "/regie/sources",
    title: "Sources",
    blurb: "État des médias, dernières collectes et alertes.",
  },
  {
    href: "/regie/pipeline",
    title: "Collecte et traduction",
    blurb: "Lancer la collecte ou le traitement, consulter les rapports d’étape.",
  },
  {
    href: "/regie/dedup",
    title: "Dédoublonnage",
    blurb: "Fusions et signalements.",
  },
  {
    href: "/regie/clustering",
    title: "Regroupements",
    blurb: "Paramètres et documentation.",
  },
  {
    href: "/regie/curator",
    title: "Curateur",
    blurb: "Historique des propositions de sujets.",
  },
  {
    href: "/regie/logs",
    title: "Journaux",
    blurb: "Traces techniques et journal des opérations.",
  },
  {
    href: "/dashboard",
    title: "Sujets automatiques",
    blurb: "Vue technique des regroupements en base.",
  },
];

export default function RegieHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Régie
        </h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-foreground-body">
          Outils internes pour la revue de presse : sources, pipeline, suivi et
          journaux.
        </p>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {sections.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block py-4 transition-colors hover:bg-muted/30"
            >
              <h2 className="font-[family-name:var(--font-serif)] text-[16px] font-semibold text-foreground">
                {s.title}
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-foreground-body">
                {s.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:underline">
          Retour au sommaire du jour
        </Link>
        {" · "}
        <Link href="/articles" className="underline-offset-4 hover:underline">
          Articles
        </Link>
      </p>
    </div>
  );
}
