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
    blurb: "Pipeline, clusters et inventaire — vue technique.",
  },
  {
    href: "/regie/pipeline",
    title: "Pipeline (régie)",
    blurb: "Placeholder — rapports JSON à brancher sur l’API debug.",
  },
  {
    href: "/regie/dedup",
    title: "Déduplication",
    blurb: "Groupes syndication — à connecter aux logs pipeline_debug_logs.",
  },
  {
    href: "/regie/clustering",
    title: "Clustering",
    blurb: "Paramètres UMAP/HDBSCAN et visualisations — en cours.",
  },
  {
    href: "/regie/curator",
    title: "Curateur",
    blurb: "Entrées/sorties LLM et diffs — en cours.",
  },
  {
    href: "/regie/logs",
    title: "Logs",
    blurb: "Flux structuré — à brancher sur le backend.",
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
          Espace séparé du chemin critique (composition). Les vues détaillées
          s’appuient progressivement sur les rapports JSON du pipeline (spec §10).
        </p>
      </div>
      <ul className="divide-y divide-border-light border-y border-border">
        {sections.map((s) => (
          <li key={s.href} className="py-4 first:pt-0 last:pb-0">
            <Link
              href={s.href}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {s.title}
            </Link>
            <p className="mt-1 max-w-xl text-[12px] text-muted-foreground">{s.blurb}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
