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
  { key: "refreshClusters", label: "Actualiser les sujets" },
  { key: "pipeline", label: "Traitement complet" },
  { key: "resumePipeline", label: "Reprendre le pipeline" },
];

/** Libellés métier pour les statuts API (éviter « degraded / dead » bruts). */
function collecteStatusFr(code: string): { label: string; lineClass: string } {
  const c = (code || "").toLowerCase();
  if (c === "dead") {
    return {
      label: "Collecte interrompue",
      lineClass: "border-l-destructive/50",
    };
  }
  if (c === "degraded") {
    return {
      label: "Collecte irrégulière",
      lineClass: "border-l-warning/55",
    };
  }
  return {
    label: "Collecte normale",
    lineClass: "border-l-border",
  };
}

function formatTranslationHint(s: {
  translation_24h_ok_persisted?: number | null;
  translation_24h_errors_persisted?: number | null;
}): string | null {
  const okP = s.translation_24h_ok_persisted;
  const err = s.translation_24h_errors_persisted;
  if (okP == null && (err == null || err === 0)) return null;
  const parts: string[] = [];
  if (okP != null) {
    parts.push(
      `${okP} traduction${okP !== 1 ? "s" : ""} enregistrée${okP !== 1 ? "s" : ""} (24 h)`,
    );
  }
  if (err != null && err > 0) {
    parts.push(
      `${err} erreur${err !== 1 ? "s" : ""} de traduction persistée${err !== 1 ? "s" : ""}`,
    );
  }
  return parts.length ? parts.join(". ") : null;
}

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
        {ACTIONS.map(({ key, label }) => {
          const serverPipelineBusy =
            (key === "pipeline" || key === "resumePipeline") &&
            Boolean(status?.pipeline_running);
          return (
            <button
              key={key}
              type="button"
              onClick={() => startRun(key, label)}
              disabled={running !== null || serverPipelineBusy}
              className="olj-btn-secondary text-[12px] disabled:opacity-40"
              title={
                serverPipelineBusy
                  ? "Un pipeline complet est déjà en cours sur le serveur (planificateur ou autre session)."
                  : key === "resumePipeline"
                    ? "Reprend là où les étapes sont déjà journalisées (collecte / traduction ignorées si présentes ce jour, Asia/Beirut)."
                    : undefined
              }
            >
              {running?.key === key ? "En cours…" : label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Collecte (sources), traduction, actualisation des sujets, traitement
        complet ou reprise (saut des étapes déjà enregistrées ce jour). Le suivi
        reste visible en haut de page pendant la navigation.
        {status?.pipeline_running ? (
          <span className="mt-1 block border-l-2 border-border pl-2 text-foreground-body">
            Un pipeline complet est en cours sur le serveur : les boutons « Traitement complet » et « Reprendre le pipeline » sont désactivés
            jusqu’à la fin du passage (cron ou autre lancement).
          </span>
        ) : null}
      </p>

      {diagnostics.length > 0 && (
        <details className="border border-border-light bg-muted/50 p-3 text-[11px] text-foreground-body">
          <summary className="cursor-pointer font-medium text-foreground-subtle">
            Journal technique ({diagnostics.length} lignes)
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-foreground">
            {diagnostics.join("\n")}
          </pre>
          <button
            type="button"
            onClick={() => clearDiagnostics()}
            className="mt-2 text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Effacer le journal
          </button>
        </details>
      )}

      {status?.jobs && status.jobs.length > 0 && (
        <div className="space-y-2 border-t border-border-light pt-3 text-[12px] text-muted-foreground">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Tâches planifiées
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground/90">
            Prochain créneau brut (serveur). Dernier passage : mémoire du processus API, effacée au redémarrage.
          </p>
          {status.jobs.map((job) => (
            <div key={job.id} className="border-l border-border-light pl-2 text-[11px] leading-snug">
              <div className="font-medium text-foreground-subtle">{job.name}</div>
              <div className="tabular-nums text-muted-foreground">
                Prochain : {job.next_run ?? "—"}
              </div>
              {job.last_run_at ? (
                <div className="tabular-nums text-muted-foreground">
                  Dernier : {job.last_run_at}
                  {job.last_run_ok === false ? " · échec" : job.last_run_ok === true ? " · OK" : ""}
                </div>
              ) : (
                <div className="text-muted-foreground/80">Dernier : — (depuis boot)</div>
              )}
            </div>
          ))}
        </div>
      )}

      {sourceHealth && sourceHealth.sources.length > 0 && (
        <div className="border-t border-border-light pt-3">
          <div className="mb-2">
            <p className="olj-rubric olj-rule text-[11px]">État des sources</p>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
              Volume d’articles sur les{" "}
              <strong className="font-medium text-foreground-subtle">
                {sourceHealth.window_hours} dernières heures
              </strong>{" "}
              (collecte). Les chiffres de traduction concernent les{" "}
              <strong className="font-medium text-foreground-subtle">
                24 dernières heures
              </strong>{" "}
              (enregistrements réussis ou erreurs persistées en base).
            </p>
            {sourceHealth.translation_metrics_note_fr ? (
              <p className="mt-1.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
                {sourceHealth.translation_metrics_note_fr}
              </p>
            ) : null}
            <details className="mt-2 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground-subtle hover:text-foreground">
                Lire les statuts de collecte
              </summary>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 pl-0.5 leading-relaxed">
                <li>
                  <strong className="text-foreground-subtle">Collecte normale</strong> : flux
                  considéré sain pour la fenêtre affichée.
                </li>
                <li>
                  <strong className="text-foreground-subtle">Collecte irrégulière</strong> : peu
                  d’articles ou séries de collectes vides ; la source peut toutefois avoir du stock
                  (voir le nombre d’articles).
                </li>
                <li>
                  <strong className="text-foreground-subtle">Collecte interrompue</strong> : pas
                  d’article dans la fenêtre ou source inactive côté pipeline.
                </li>
              </ul>
            </details>
          </div>
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
            const wh = sourceHealth.window_hours;
            return (
              <>
                {alertOnes.length === 0 && !showAllSources && (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    Aucune source en alerte. Aperçu de six sources (ordre API).
                  </p>
                )}
                <div className="max-h-60 overflow-y-auto border border-border-light bg-card">
                  {rows.map((s) => {
                    const { label: statusLabel, lineClass } = collecteStatusFr(
                      s.health_status,
                    );
                    const n = s.articles_72h;
                    const artLabel = `${n} article${n !== 1 ? "s" : ""} (${wh} h)`;
                    const trad = formatTranslationHint(s);
                    const statusTone =
                      s.health_status === "dead"
                        ? "text-destructive"
                        : s.health_status === "degraded"
                          ? "text-warning"
                          : "text-foreground-body";
                    return (
                      <div
                        key={s.id}
                        className={`border-b border-border-light border-l-2 bg-card px-3 py-2.5 last:border-b-0 ${lineClass}`}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <p className="min-w-0 shrink font-[family-name:var(--font-serif)] text-[13px] font-medium leading-snug text-foreground">
                            {s.name}
                          </p>
                          <div className="min-w-0 shrink-0 space-y-0.5 text-[11px] leading-snug sm:max-w-[min(100%,20rem)] sm:text-right">
                            <p className={statusTone}>
                              <span className="font-medium">{statusLabel}</span>
                              <span className="text-muted-foreground">
                                {" "}
                                · {artLabel}
                              </span>
                            </p>
                            {trad ? (
                              <p className="text-muted-foreground">{trad}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {showAllSources || canExpand ? (
                  <button
                    type="button"
                    onClick={() => setShowAllSources(!showAllSources)}
                    className="mt-2 text-[11px] text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
                  >
                    {showAllSources
                      ? "Replier la liste"
                      : `Afficher toutes les sources (${sourceHealth.sources.length})`}
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
