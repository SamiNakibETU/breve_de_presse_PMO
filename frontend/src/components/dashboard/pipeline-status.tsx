"use client";

import { useState } from "react";
import type { AppStatus } from "@/lib/types";
import { api } from "@/lib/api";
import { Play, Loader2 } from "lucide-react";

interface PipelineStatusProps {
  status: AppStatus | null;
  onRefresh: () => void;
}

type Action = "collect" | "translate" | "pipeline";

export function PipelineStatus({ status, onRefresh }: PipelineStatusProps) {
  const [running, setRunning] = useState<Action | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function run(action: Action) {
    setRunning(action);
    setResult(null);
    try {
      const fn =
        action === "collect"
          ? api.triggerCollect
          : action === "translate"
            ? api.triggerTranslate
            : api.triggerPipeline;
      const data = await fn();
      setResult(JSON.stringify(data.stats, null, 2));
      onRefresh();
    } catch (err) {
      setResult(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(null);
    }
  }

  const ACTIONS: { id: Action; label: string }[] = [
    { id: "collect", label: "Collecte RSS" },
    { id: "translate", label: "Traduction" },
    { id: "pipeline", label: "Pipeline complet" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {ACTIONS.map(({ id, label }) => (
          <button
            key={id}
            disabled={running !== null}
            onClick={() => run(id)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {running === id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </div>

      {status?.jobs && status.jobs.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Jobs programmés
          </h3>
          <div className="space-y-1 text-sm">
            {status.jobs.map((job) => (
              <div key={job.id} className="flex justify-between">
                <span>{job.name}</span>
                <span className="text-muted-foreground">
                  {job.next_run ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-muted p-4 text-xs">
          {result}
        </pre>
      )}
    </div>
  );
}
