"use client";

import { useState } from "react";
import { usePipelineRunner } from "@/contexts/pipeline-runner";
import type {
  AppStatus,
  MediaSourcesHealthResponse,
} from "@/lib/types";
import {
  PipelineResultPanel,
  type PipelineActionKey,
} from "./pipeline-result-panel";

interface PipelineStatusProps {
  status: AppStatus | null;
  /** Santé des sources (GET /api/media-sources/health) — affichage discret sous le pipeline */
  sourceHealth?: MediaSourcesHealthResponse | null;
}

const ACTIONS: { key: PipelineActionKey; label: string }[] = [
  { key: "collect", label: "Collecte" },
  { key: "translate", label: "Traduction" },
  { key: "refreshClusters", label: "Refresh clusters" },
  { key: "pipeline", label: "Pipeline complet" },
];

export function PipelineStatus({
  status,
  sourceHealth,
}: PipelineStatusProps) {
  const { running, lastRun, diagnostics, startRun, clearDiagnostics } =
    usePipelineRunner();
  const [showAllSources, setShowAllSources] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => startRun(key, label)}
            disabled={running !== null}
            className="border border-[#dddcda] bg-white px-4 py-1.5 text-[12px] font-medium text-[#1a1a1a] transition-colors hover:bg-[#f7f7f5] disabled:opacity-40"
          >
            {running?.key === key ? "En cours…" : label}
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-[#888]">
        <strong>Collecte</strong> : RSS + scrapers → articles « collectés ».{" "}
        <strong>Traduction</strong> : LLM → titres/résumés FR + type.{" "}
        <strong>Refresh clusters</strong> : embeddings Cohere + regroupement + libellés.{" "}
        <strong>Pipeline complet</strong> : tout l’enchaînement (plusieurs minutes
        possibles). Le suivi continue si vous quittez cette page : bandeau en tête
        du site + reprise après rechargement (session). Polling espacé pour limiter
        la charge navigateur.
      </p>

      {diagnostics.length > 0 && (
        <details className="rounded border border-[#eeede9] bg-[#fafaf8] p-3 text-[11px] text-[#555]">
          <summary className="cursor-pointer font-medium text-[#444]">
            Journal technique ({diagnostics.length} lignes)
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-[#333]">
            {diagnostics.join("\n")}
          </pre>
          <button
            type="button"
            onClick={() => clearDiagnostics()}
            className="mt-2 text-[10px] text-[#888] underline underline-offset-2 hover:text-[#1a1a1a]"
          >
            Effacer le journal
          </button>
        </details>
      )}

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

      {sourceHealth && sourceHealth.sources.length > 0 && (
        <div className="border-t border-[#eeede9] pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888]">
            Sources · fenêtre {sourceHealth.window_hours} h (collecte) · trad. 24 h
          </p>
          {(() => {
            const alertOnes = sourceHealth.sources.filter(
              (s) => s.health_status === "dead" || s.health_status === "degraded",
            );
            const rows = showAllSources
              ? sourceHealth.sources
              : alertOnes.length > 0
                ? alertOnes
                : sourceHealth.sources.slice(0, 6);
            const canExpand =
              !showAllSources &&
              ((alertOnes.length > 0 &&
                sourceHealth.sources.length > alertOnes.length) ||
                (alertOnes.length === 0 && sourceHealth.sources.length > 6));
            return (
              <>
                {alertOnes.length === 0 && !showAllSources && (
                  <p className="mb-2 text-[11px] text-[#888]">
                    Aucune source en alerte (dégradée / morte). Aperçu des six
                    premières.
                  </p>
                )}
                <div className="max-h-52 overflow-y-auto border border-[#eeede9] text-[11px]">
                  {rows.map((s) => {
                    const err = s.translation_24h_errors_persisted;
                    const okP = s.translation_24h_ok_persisted;
                    const extra =
                      err != null && err > 0
                        ? ` · trad. 24 h : ${okP ?? "—"} ok / ${err} err.`
                        : okP != null
                          ? ` · trad. 24 h : ${okP} ok`
                          : "";
                    return (
                      <div
                        key={s.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-[#f5f4f1] px-2 py-1.5"
                      >
                        <span className="min-w-0 truncate text-[#1a1a1a]">
                          {s.name}
                        </span>
                        <span className="shrink-0 text-right text-[#888]">
                          <span
                            className={
                              s.health_status === "dead"
                                ? "text-[#c8102e]"
                                : s.health_status === "degraded"
                                  ? "text-[#a67c00]"
                                  : ""
                            }
                          >
                            {s.health_status}
                          </span>
                          {" · "}
                          {s.articles_72h} art.{extra}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {showAllSources || canExpand ? (
                  <button
                    type="button"
                    onClick={() => setShowAllSources(!showAllSources)}
                    className="mt-2 text-[11px] text-[#888] underline decoration-[#ddd] underline-offset-2 hover:text-[#1a1a1a]"
                  >
                    {showAllSources
                      ? "Replier"
                      : `Tout voir (${sourceHealth.sources.length} sources)`}
                  </button>
                ) : null}
              </>
            );
          })()}
        </div>
      )}

      <PipelineResultPanel
        run={lastRun}
        running={
          running
            ? {
                key: running.key,
                label: running.label,
                serverLiveStep: running.stepLabel,
              }
            : null
        }
      />
    </div>
  );
}
