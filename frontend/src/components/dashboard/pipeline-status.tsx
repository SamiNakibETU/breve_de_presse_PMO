"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus } from "@/lib/types";
import {
  PipelineResultPanel,
  type PipelineActionKey,
  type PipelineRunRecord,
} from "./pipeline-result-panel";

interface PipelineStatusProps {
  status: AppStatus | null;
  onRefresh: () => void;
}

const ACTIONS: {
  key: PipelineActionKey;
  label: string;
  fn: () => Promise<unknown>;
}[] = [
  { key: "collect", label: "Collecte", fn: () => api.triggerCollect() },
  { key: "translate", label: "Traduction", fn: () => api.triggerTranslate() },
  {
    key: "refreshClusters",
    label: "Refresh clusters",
    fn: () => api.refreshClusters(),
  },
  { key: "pipeline", label: "Pipeline complet", fn: () => api.triggerPipeline() },
];

export function PipelineStatus({ status, onRefresh }: PipelineStatusProps) {
  const [running, setRunning] = useState<PipelineActionKey | null>(null);
  const [lastRun, setLastRun] = useState<PipelineRunRecord | null>(null);

  async function run(key: PipelineActionKey, label: string, fn: () => Promise<unknown>) {
    setRunning(key);
    const t0 = performance.now();
    const at = new Date().toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "medium",
    });
    try {
      const data = await fn();
      const durationMs = performance.now() - t0;
      setLastRun({
        action: key,
        label,
        ok: true,
        durationMs,
        payload: data,
        at,
      });
      onRefresh();
    } catch (err) {
      const durationMs = performance.now() - t0;
      setLastRun({
        action: key,
        label,
        ok: false,
        durationMs,
        payload: null,
        errorMessage:
          err instanceof Error ? err.message : "Erreur inconnue",
        at,
      });
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
            type="button"
            onClick={() => void run(key, label, fn)}
            disabled={running !== null}
            className="border border-[#dddcda] bg-white px-4 py-1.5 text-[12px] font-medium text-[#1a1a1a] transition-colors hover:bg-[#f7f7f5] disabled:opacity-40"
          >
            {running === key ? "En cours…" : label}
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-[#888]">
        <strong>Collecte</strong> : RSS + scrapers → articles « collectés ».{" "}
        <strong>Traduction</strong> : LLM → titres/résumés FR + type.{" "}
        <strong>Refresh clusters</strong> : embeddings Cohere + regroupement + libellés.{" "}
        <strong>Pipeline complet</strong> : tout l’enchaînement (peut prendre plusieurs
        minutes).
      </p>

      {status?.jobs && status.jobs.length > 0 && (
        <div className="space-y-1 border-t border-[#eeede9] pt-3 text-[12px] text-[#888]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888]">
            Tâches planifiées (UTC)
          </p>
          {status.jobs.map((job) => (
            <div key={job.id} className="flex justify-between gap-2">
              <span>{job.name}</span>
              <span className="shrink-0 tabular-nums">{job.next_run}</span>
            </div>
          ))}
        </div>
      )}

      <PipelineResultPanel run={lastRun} />
    </div>
  );
}
