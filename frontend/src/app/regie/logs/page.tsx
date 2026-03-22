"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";

export default function RegieLogsPage() {
  const pipelineQ = useQuery({
    queryKey: ["regie", "pipeline-debug-logs", "logs"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 40 }),
  });
  const llmQ = useQuery({
    queryKey: ["regie", "llm-call-logs"] as const,
    queryFn: () => api.regieLlmCallLogs({ limit: 40, include_raw: true }),
  });

  return (
    <div className="space-y-8 text-[13px] leading-relaxed text-foreground-body">
      <h1 className="font-[family-name:var(--font-serif)] text-[20px] font-semibold text-foreground">
        Logs
      </h1>
      <p>
        Rapports d’étapes pipeline et{" "}
        <span className="text-foreground">journal des appels modèle</span> (régie
        uniquement).{" "}
        <Link href="/regie/pipeline" className="underline-offset-4 hover:underline">
          Pipeline seul
        </Link>
        .
      </p>

      <section className="space-y-2" aria-labelledby="logs-pipeline">
        <h2 id="logs-pipeline" className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Étapes pipeline
        </h2>
        {pipelineQ.isPending && <p role="status">Chargement…</p>}
        {pipelineQ.error && (
          <p className="text-destructive" role="alert">
            {pipelineQ.error instanceof Error
              ? pipelineQ.error.message
              : "Erreur"}
          </p>
        )}
        {pipelineQ.data && (
          <ul className="space-y-2 border border-border-light p-3 font-mono text-[11px]">
            {pipelineQ.data.items.length === 0 && (
              <li className="text-muted-foreground">Aucune entrée.</li>
            )}
            {pipelineQ.data.items.map((r) => (
              <li key={r.id} className="border-b border-border-light pb-2 last:border-0">
                <span className="text-muted-foreground">{r.created_at}</span>{" "}
                <strong>{r.step}</strong> — {r.edition_id ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="logs-llm">
        <h2 id="logs-llm" className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Appels LLM
        </h2>
        {llmQ.isPending && <p role="status">Chargement…</p>}
        {llmQ.error && (
          <p className="text-destructive" role="alert">
            {llmQ.error instanceof Error ? llmQ.error.message : "Erreur"}
          </p>
        )}
        {llmQ.data && (
          <div className="overflow-x-auto border border-border-light">
            <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-2 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Prompt</th>
                  <th className="px-2 py-2 font-medium">Modèle</th>
                  <th className="px-2 py-2 font-medium">Jetons</th>
                  <th className="px-2 py-2 font-medium">Aperçu sortie</th>
                </tr>
              </thead>
              <tbody>
                {llmQ.data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-muted-foreground">
                      Aucun appel enregistré.
                    </td>
                  </tr>
                )}
                {llmQ.data.items.map((r) => (
                  <tr key={r.id} className="border-b border-border-light align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px] text-muted-foreground">
                      {r.created_at}
                    </td>
                    <td className="px-2 py-2">
                      {r.prompt_id}
                      {r.has_validation_error ? (
                        <span className="ml-1 text-destructive">(validation)</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 font-mono text-[11px]">{r.model_used}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px]">
                      {r.input_tokens ?? "—"} / {r.output_tokens ?? "—"}
                    </td>
                    <td className="max-w-[min(28rem,100%)] px-2 py-2 font-mono text-[11px]">
                      {r.output_raw_preview ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border-light px-2 py-2 text-[11px] text-muted-foreground">
              Total : {llmQ.data.total}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
