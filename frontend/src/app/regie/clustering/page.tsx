import Link from "next/link";

/** Page régie : pas de table clustering_run dédiée ; logs pipeline + configuration backend. */
export default function RegieClusteringPage() {
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-foreground-body">
      <header className="space-y-2">
        <p className="olj-rubric">Régie · Production</p>
        <h1 className="font-[family-name:var(--font-serif)] text-[22px] font-semibold text-foreground">
          Regroupements (paramètres)
        </h1>
      </header>
      <p>
        Les réglages UMAP / HDBSCAN sont dans le backend (
        <code className="text-[12px]">clustering_use_umap</code>,{" "}
        <code className="text-[12px]">umap_n_components</code>, etc. — voir{" "}
        <code className="text-[12px]">.env.example</code>
        ). Les sorties d’étape utiles au diagnostic sont dans{" "}
        <Link href="/regie/pipeline" className="underline-offset-4 hover:underline">
          Étapes pipeline
        </Link>{" "}
        (rapports JSON par étape).
      </p>
      <p className="text-muted-foreground">
        Vue sujets côté produit :{" "}
        <Link href="/panorama" className="underline-offset-4 hover:underline">
          Panorama
        </Link>
        .
      </p>
    </div>
  );
}
