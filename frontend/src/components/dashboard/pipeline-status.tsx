"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus } from "@/lib/types";

interface PipelineStatusProps {
  status: AppStatus | null;
  onRefresh: () => void;
}

const ACTIONS = [
  {
    key: "collect",
    label: "Collecte RSS",
    fn: () => api.triggerCollect(),
  },
  {
    key: "translate",
    label: "Traduction",
    fn: () => api.triggerTranslate(),
  },
  {
    key: "pipeline",
    label: "Pipeline complet",
    fn: () => api.triggerPipeline(),
  },
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
      setResult(
        err instanceof Error ? err.message : "Erreur"
      );
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ key, label, fn }) => (
          <button
            key={key}
            onClick={() => run(key, fn)}
            disabled={running !== null}
            className="border border-border-light px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/40 disabled:opacity-40"
          >
            {running === key ? "En cours…" : label}
          </button>
        ))}
      </div>

      {status?.jobs && status.jobs.length > 0 && (
        <div className="border-t border-border-light pt-4">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Tâches programmées
          </p>
          <div className="space-y-1">
            {status.jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-baseline justify-between text-[13px]"
              >
                <span className="text-foreground">{job.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {job.next_run}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <pre className="overflow-x-auto border border-border-light bg-surface p-4 text-[12px] leading-relaxed text-muted-foreground">
          {result}
        </pre>
      )}
    </div>
  );
}
