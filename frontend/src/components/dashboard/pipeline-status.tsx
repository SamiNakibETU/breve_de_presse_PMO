"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus } from "@/lib/types";

interface PipelineStatusProps {
  status: AppStatus | null;
  onRefresh: () => void;
}

const ACTIONS = [
  { key: "collect", label: "Collecte", fn: () => api.triggerCollect() },
  { key: "translate", label: "Traduction", fn: () => api.triggerTranslate() },
  { key: "pipeline", label: "Pipeline", fn: () => api.triggerPipeline() },
] as const;

export function PipelineStatus({ status, onRefresh }: PipelineStatusProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setRunning(key);
    setResult(null);
    try {
      const data = await fn();
      setResult(JSON.stringify(data, null, 2));
      onRefresh();
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Actions
      </p>
      <div className="mt-3 flex flex-col gap-1">
        {ACTIONS.map(({ key, label, fn }) => (
          <button
            key={key}
            onClick={() => run(key, fn)}
            disabled={running !== null}
            className="w-full text-left font-mono text-[11px] tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {running === key ? "…" : label}
          </button>
        ))}
      </div>

      {status?.jobs && status.jobs.length > 0 && (
        <div className="mt-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Tâches
          </p>
          <div className="mt-2 space-y-1">
            {status.jobs.map((job) => (
              <div
                key={job.id}
                className="flex justify-between font-mono text-[11px] text-muted-foreground"
              >
                <span>{job.name}</span>
                <span className="tabular-nums">{job.next_run}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <pre className="mt-6 overflow-x-auto font-mono text-[10px] leading-relaxed text-muted-foreground">
          {result}
        </pre>
      )}
    </div>
  );
}
