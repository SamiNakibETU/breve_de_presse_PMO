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
  { key: "refreshClusters", label: "Refresh clusters", fn: () => api.refreshClusters() },
  { key: "pipeline", label: "Pipeline complet", fn: () => api.triggerPipeline() },
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
    <div className="space-y-3">
      <div className="flex gap-2">
        {ACTIONS.map(({ key, label, fn }) => (
          <button
            key={key}
            onClick={() => run(key, fn)}
            disabled={running !== null}
            className="border border-[#dddcda] bg-white px-4 py-1.5 text-[12px] font-medium text-[#1a1a1a] transition-colors hover:bg-[#f7f7f5] disabled:opacity-40"
          >
            {running === key ? "…" : label}
          </button>
        ))}
      </div>

      {status?.jobs && status.jobs.length > 0 && (
        <div className="space-y-1 text-[12px] text-[#888]">
          {status.jobs.map((job) => (
            <div key={job.id} className="flex justify-between">
              <span>{job.name}</span>
              <span className="tabular-nums">{job.next_run}</span>
            </div>
          ))}
        </div>
      )}

      {result && (
        <pre className="border border-[#eeede9] bg-[#f9f8f5] p-3 text-[11px] leading-relaxed text-[#888]">
          {result}
        </pre>
      )}
    </div>
  );
}
