"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { api } from "@/lib/api";
import type { AppStatus, MediaSourcesHealthResponse } from "@/lib/types";

function previewPayload(p: Record<string, unknown>, max = 400): string {
  try {
    const s = JSON.stringify(p);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return "";
  }
}

export default function RegiePipelinePage() {
  const statusQ = useQuery({
    queryKey: ["status"] as const,
    queryFn: (): Promise<AppStatus> => api.status(),
  });

  const healthQ = useQuery({
    queryKey: ["mediaSourcesHealth"] as const,
    queryFn: (): Promise<MediaSourcesHealthResponse> =>
      api.mediaSourcesHealth(),
  });

  const logsQ = useQuery({
    queryKey: ["regie", "pipeline-debug-logs"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 80 }),
  });

  const status = statusQ.data ?? null;
  const sourceHealth = healthQ.data ?? null;

  return (
    <div className="space-y-10 text-[13px] leading-relaxed text-foreground-body">
      <header>
        <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
          Collecte et traduction
        </h1>
        <p className="mt-2 max-w-[52rem] text-[13px]">
          Démarrez une étape ci-dessous. Les rapports détaillés suivent. Journaux
          LLM :{" "}
          <Link href="/regie/logs" className="underline-offset-4 hover:underline">
            Journaux
          </Link>
          .
        </p>
      </header>

      <section className="border-b border-border pb-8">
        <h2 className="olj-rubric olj-rule mb-4">Actions</h2>
        <PipelineStatus status={status} sourceHealth={sourceHealth} />
      </section>

      <section>
        <h2 className="olj-rubric olj-rule mb-4">Rapports d’étape récents</h2>

        {logsQ.isPending && (
          <p className="text-muted-foreground" role="status">
            Chargement…
          </p>
        )}
        {logsQ.error && (
          <p className="text-destructive" role="alert">
            {logsQ.error instanceof Error
              ? logsQ.error.message
              : "Erreur de chargement"}
          </p>
        )}
        {logsQ.data && logsQ.data.items.length === 0 && (
          <p className="text-muted-foreground">Aucune entrée pour l’instant.</p>
        )}
        {logsQ.data && logsQ.data.items.length > 0 && (
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
                {logsQ.data.items.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border-light align-top"
                  >
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-muted-foreground">
                      {row.created_at}
                    </td>
                    <td className="px-2 py-2 font-medium text-foreground">
                      {row.step}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">
                      {row.edition_id ?? "Non lié"}
                    </td>
                    <td className="max-w-[min(32rem,100%)] px-2 py-2 font-mono text-[11px] text-foreground-body">
                      {previewPayload(row.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border-light px-2 py-2 text-[11px] text-muted-foreground">
              Total : {logsQ.data.total} entrée{logsQ.data.total !== 1 ? "s" : ""}{" "}
              (page limitée à 80).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
