"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PipelineStatusBadge } from "@/components/regie/pipeline-status-badge";
import { api } from "@/lib/api";
import {
  durationFromPayload,
  formatPayloadPretty,
  inferPipelineStatus,
} from "@/lib/pipeline-debug-log";
import type { PipelineDebugLogItem } from "@/lib/types";

export default function RegieLogsPage() {
  const pipelineQ = useQuery({
    queryKey: ["regie", "pipeline-debug-logs", "logs"] as const,
    queryFn: () => api.regiePipelineDebugLogs({ limit: 80 }),
  });
  const llmQ = useQuery({
    queryKey: ["regie", "llm-call-logs"] as const,
    queryFn: () => api.regieLlmCallLogs({ limit: 40, include_raw: true }),
  });

  const [stepFilter, setStepFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const stepsMeta = useMemo(() => {
    const items = pipelineQ.data?.items ?? [];
    const counts = new Map<string, number>();
    for (const r of items) {
      counts.set(r.step, (counts.get(r.step) ?? 0) + 1);
    }
    const unique = [...counts.keys()].sort((a, b) => a.localeCompare(b, "fr"));
    return { counts, unique };
  }, [pipelineQ.data?.items]);

  const filteredPipelineItems = useMemo((): PipelineDebugLogItem[] => {
    const items = pipelineQ.data?.items ?? [];
    if (!stepFilter) return items;
    return items.filter((r) => r.step === stepFilter);
  }, [pipelineQ.data?.items, stepFilter]);

  const lastRun = pipelineQ.data?.items?.[0];
  const lastKind = lastRun
    ? inferPipelineStatus(lastRun.payload, lastRun.step)
    : null;

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

      <section className="space-y-3" aria-labelledby="logs-pipeline">
        <h2
          id="logs-pipeline"
          className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
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
        {lastRun && lastKind ? (
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-foreground-body">
            <span className="font-medium text-foreground">Dernier enregistrement :</span>
            <PipelineStatusBadge kind={lastKind} />
            <span className="text-muted-foreground">{lastRun.step}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {lastRun.created_at}
            </span>
          </p>
        ) : null}
        {pipelineQ.data && pipelineQ.data.items.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {pipelineQ.data.total} entrée
              {pipelineQ.data.total !== 1 ? "s" : ""}
            </span>
            <span aria-hidden>·</span>
            {stepsMeta.unique.map((step) => (
              <span key={step} className="tabular-nums">
                <span className="text-foreground">{stepsMeta.counts.get(step) ?? 0}</span>{" "}
                <code className="text-[10px] text-muted-foreground">{step}</code>
              </span>
            ))}
          </div>
        ) : null}
        {pipelineQ.data && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px]">
              <span className="text-muted-foreground">Filtrer par étape</span>
              <select
                className="rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground"
                value={stepFilter}
                onChange={(e) => setStepFilter(e.target.value)}
              >
                <option value="">Toutes</option>
                {stepsMeta.unique.map((s) => (
                  <option key={s} value={s}>
                    {s} ({stepsMeta.counts.get(s) ?? 0})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {pipelineQ.data && (
          <ul className="space-y-0 border border-border-light font-mono text-[11px]">
            {filteredPipelineItems.length === 0 && (
              <li className="p-3 text-muted-foreground">Aucune entrée.</li>
            )}
            {filteredPipelineItems.map((r) => {
              const st = inferPipelineStatus(r.payload, r.step);
              const dur = durationFromPayload(r.payload);
              const open = expandedId === r.id;
              const pretty = formatPayloadPretty(r.payload);
              return (
                <li
                  key={r.id}
                  className="border-b border-border-light last:border-b-0"
                >
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-start gap-2 px-3 py-2 text-left hover:bg-muted/30"
                    onClick={() => setExpandedId(open ? null : r.id)}
                    aria-expanded={open}
                  >
                    <PipelineStatusBadge kind={st} />
                    <span className="shrink-0 text-muted-foreground">{r.created_at}</span>
                    <strong className="text-foreground">{r.step}</strong>
                    <span className="text-muted-foreground">
                      {r.edition_id ?? "—"}
                    </span>
                    {dur ? (
                      <span className="text-[10px] text-muted-foreground">{dur}</span>
                    ) : null}
                    <span className="ml-auto text-[10px] text-accent">
                      {open ? "Masquer" : "Payload"}
                    </span>
                  </button>
                  {open ? (
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-border-light bg-muted/20 px-3 py-2 text-[10px] leading-relaxed text-foreground-body">
                      {pretty}
                    </pre>
                  ) : (
                    <p className="border-t border-border-light px-3 py-1.5 text-[10px] text-muted-foreground line-clamp-2">
                      {pretty.slice(0, 220)}
                      {pretty.length > 220 ? "…" : ""}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="logs-llm">
        <h2
          id="logs-llm"
          className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
        >
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
