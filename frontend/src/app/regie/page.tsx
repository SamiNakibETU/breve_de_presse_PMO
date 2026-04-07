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
    blurb: "Paramètres HDBSCAN et documentation.",
  },
  {
    href: "/panorama",
    title: "Panorama",
    blurb: "Vue d’ensemble des volumes et des regroupements thématiques (produit).",
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
];

export default function RegieHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="olj-rubric">Production</p>
        <h1 className="mt-1 font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Régie
        </h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-foreground-body">
          Production : collecte, traduction, dédoublonnage, regroupements et
          curateur. Données : état des sources et journaux techniques.
        </p>
      </div>
      <ul className="grid gap-px border border-border bg-border sm:grid-cols-2">
        {sections.map((s) => (
          <li key={s.href} className="bg-background">
            <Link
              href={s.href}
              className="block h-full p-4 transition-colors hover:bg-muted/25 sm:p-5"
            >
              <h2 className="font-[family-name:var(--font-serif)] text-[15px] font-semibold text-foreground">
                {s.title}
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-foreground-body">
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
