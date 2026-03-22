export default function RegieClusteringPage() {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-[#555]">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-[#1a1a1a]">
        Clustering
      </h1>
      <p>
        Paramètres UMAP (15D), HDBSCAN (<code className="text-[12px]">leaf</code>
        ), fusion des centroïdes : exposer depuis{" "}
        <code className="text-[12px]">clustering_run</code> (spec §4.4).
      </p>
    </div>
  );
}
