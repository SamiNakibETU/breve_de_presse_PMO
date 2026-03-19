"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { AppStatus, PipelineTaskKind } from "@/lib/types";
import {
  PipelineResultPanel,
  type PipelineActionKey,
  type PipelineRunRecord,
} from "./pipeline-result-panel";

interface PipelineStatusProps {
  status: AppStatus | null;
  onRefresh: () => void;
}

const ACTIONS: { key: PipelineActionKey; label: string }[] = [
  { key: "collect", label: "Collecte" },
  { key: "translate", label: "Traduction" },
  { key: "refreshClusters", label: "Refresh clusters" },
  { key: "pipeline", label: "Pipeline complet" },
];

const TASK_KIND_BY_ACTION: Record<PipelineActionKey, PipelineTaskKind> = {
  collect: "collect",
  translate: "translate",
  refreshClusters: "refresh_clusters",
  pipeline: "full_pipeline",
};

export function PipelineStatus({ status, onRefresh }: PipelineStatusProps) {
  const [running, setRunning] = useState<PipelineActionKey | null>(null);
  const [serverLiveStep, setServerLiveStep] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<PipelineRunRecord | null>(null);

  async function run(key: PipelineActionKey, label: string) {
    setRunning(key);
    setServerLiveStep(null);
    const t0 = performance.now();
    const at = new Date().toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "medium",
    });
    const kind = TASK_KIND_BY_ACTION[key];
    try {
      const data = await api.runPipelineTaskWithProgress(
        kind,
        (s) => {
          setServerLiveStep(s.step_label);
        },
        key === "translate" ? { translateLimit: 300 } : undefined,
      );
      const durationMs = performance.now() - t0;
      setLastRun({
        action: key,
        label,
        ok: true,
        durationMs,
        payload: data,
        at,
      });
      queueMicrotask(() => {
        onRefresh();
      });
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
      queueMicrotask(() => {
        onRefresh();
      });
    } finally {
      setServerLiveStep(null);
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => void run(key, label)}
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
        minutes). Progression affichée via <strong>polling</strong> (étapes serveur).
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

      <PipelineResultPanel
        run={lastRun}
        running={
          running
            ? {
                key: running,
                label:
                  ACTIONS.find((a) => a.key === running)?.label ?? running,
                serverLiveStep,
              }
            : null
        }
      />
    </div>
  );
}
