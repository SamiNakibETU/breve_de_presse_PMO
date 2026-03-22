"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";

function previewPayload(p: Record<string, unknown>, max = 400): string {
  try {
    const s = JSON.stringify(p);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return "";
  }
}

export default function RegiePipelinePage() {
  const q = useQuery({
    queryKey: ["regie", "pipeline-debug-logs"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 80 }),
  });

  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-foreground-body">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
        Étapes pipeline (régie)
      </h1>
      <p className="max-w-[52rem]">
        Dernières entrées des rapports d’étape (collecte, dédup, regroupement,
        etc.). Source :{" "}
        <code className="text-[12px]">pipeline_debug_logs</code>. Vue détaillée
        LLM :{" "}
        <Link href="/regie/logs" className="underline-offset-4 hover:underline">
          Logs LLM
        </Link>
        .
      </p>

      {q.isPending && (
        <p className="text-muted-foreground" role="status">
          Chargement…
        </p>
      )}
      {q.error && (
        <p className="text-destructive" role="alert">
          {q.error instanceof Error ? q.error.message : "Erreur de chargement"}
        </p>
      )}
      {q.data && q.data.items.length === 0 && (
        <p className="text-muted-foreground">Aucune entrée pour l’instant.</p>
      )}
      {q.data && q.data.items.length > 0 && (
        <div className="overflow-x-auto border border-border-light">
          <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Étape</th>
                <th className="px-2 py-2 font-medium">Édition</th>
                <th className="px-2 py-2 font-medium">Aperçu</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((row) => (
                <tr key={row.id} className="border-b border-border-light align-top">
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-muted-foreground">
                    {row.created_at}
                  </td>
                  <td className="px-2 py-2 font-medium text-foreground">{row.step}</td>
                  <td className="px-2 py-2 font-mono text-[11px]">
                    {row.edition_id ?? "—"}
                  </td>
                  <td className="max-w-[min(32rem,100%)] px-2 py-2 font-mono text-[11px] text-foreground-body">
                    {previewPayload(row.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border-light px-2 py-2 text-[11px] text-muted-foreground">
            Total : {q.data.total} entrée{q.data.total !== 1 ? "s" : ""} (page
            limitée à 80).
          </p>
        </div>
      )}
    </div>
  );
}
