export default function RegieDedupPage() {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-foreground-body">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
        Déduplication
      </h1>
      <p>
        Groupes MinHash (surface) et fusion sémantique : brancher sur les
        rapports <code className="text-[12px]">dedup_surface</code> /{" "}
        <code className="text-[12px]">dedup_semantic</code> (MEMW_PRODUCT_SPEC
        §3.6).
      </p>
    </div>
  );
}
