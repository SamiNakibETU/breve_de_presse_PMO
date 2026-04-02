"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PipelineStatus } from "@/components/dashboard/pipeline-status";
import { PipelineStatusBadge } from "@/components/regie/pipeline-status-badge";
import { api } from "@/lib/api";
import {
  durationFromPayload,
  formatPayloadPretty,
  inferPipelineStatus,
} from "@/lib/pipeline-debug-log";
import type { AppStatus, MediaSourcesHealthResponse } from "@/lib/types";

export default function RegiePipelinePage() {
  const statusQ = useQuery({
    queryKey: ["status"] as const,
    queryFn: (): Promise<AppStatus> => api.status(),
    staleTime: 30_000,
    refetchInterval: (q) =>
      q.state.data?.pipeline_running === true ? 4_000 : false,
  });

  const healthQ = useQuery({
    queryKey: ["mediaSourcesHealth"] as const,
    queryFn: ({
      signal,
    }): Promise<MediaSourcesHealthResponse> =>
      api.mediaSourcesHealth(signal),
  });

  const logsQ = useQuery({
    queryKey: ["regie", "pipeline-debug-logs"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 80 }),
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const status = statusQ.data ?? null;
  const sourceHealth = healthQ.data ?? null;

  const firstLog = logsQ.data?.items?.[0];
  const firstKind = firstLog
    ? inferPipelineStatus(firstLog.payload, firstLog.step)
    : null;

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
        {firstLog && firstKind ? (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-medium text-foreground">Dernier rapport :</span>
            <PipelineStatusBadge kind={firstKind} />
            <span className="text-muted-foreground">{firstLog.step}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {firstLog.created_at}
            </span>
          </p>
        ) : null}
        {logsQ.data && logsQ.data.items.length === 0 && (
          <p className="text-muted-foreground">Aucune entrée pour l’instant.</p>
        )}
        {logsQ.data && logsQ.data.items.length > 0 && (
          <div className="overflow-x-auto border border-border-light">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-2 py-2 font-medium">Statut</th>
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Étape</th>
                  <th className="px-2 py-2 font-medium">Édition</th>
                  <th className="px-2 py-2 font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {logsQ.data.items.map((row) => {
                  const st = inferPipelineStatus(row.payload, row.step);
                  const dur = durationFromPayload(row.payload);
                  const open = expandedId === row.id;
                  const pretty = formatPayloadPretty(row.payload);
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border-light align-top"
                    >
                      <td className="px-2 py-2">
                        <PipelineStatusBadge kind={st} />
                        {dur ? (
                          <span className="mt-1 block text-[10px] text-muted-foreground">
                            {dur}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-muted-foreground">
                        {row.created_at}
                      </td>
                      <td className="px-2 py-2 font-medium text-foreground">
                        {row.step}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">
                        {row.edition_id ?? "Non lié"}
                      </td>
                      <td className="max-w-[min(36rem,100%)] px-2 py-2">
                        <button
                          type="button"
                          className="w-full text-left font-mono text-[11px] text-foreground-body hover:text-accent"
                          onClick={() =>
                            setExpandedId(open ? null : row.id)
                          }
                          aria-expanded={open}
                        >
                          {open ? (
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border-light bg-muted/20 p-2 text-[10px]">
                              {pretty}
                            </pre>
                          ) : (
                            <span className="line-clamp-2">
                              {pretty.slice(0, 200)}
                              {pretty.length > 200 ? "…" : ""}
                            </span>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-border-light px-2 py-2 text-[11px] text-muted-foreground">
              Total : {logsQ.data.total} entrée{logsQ.data.total !== 1 ? "s" : ""}{" "}
              (page limitée à 80). Cliquez sur un aperçu pour déplier le JSON.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
