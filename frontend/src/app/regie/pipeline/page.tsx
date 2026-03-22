import Link from "next/link";

export default function RegiePipelinePage() {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-foreground-body">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
        Pipeline (régie)
      </h1>
      <p>
        Vue chronologique des étapes (collecte, traduction, embedding, dédup,
        clustering, curation) : à alimenter depuis{" "}
        <code className="text-[12px]">pipeline_debug_logs</code> (spec §10.2).
      </p>
      <p>
        En attendant, la vue{" "}
        <Link href="/dashboard" className="underline-offset-4 hover:underline">
          Pipeline &amp; clusters
        </Link>{" "}
        expose l’état courant des articles.
      </p>
    </div>
  );
}
