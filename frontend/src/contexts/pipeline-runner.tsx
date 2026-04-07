"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, pollPipelineTaskUntilDone } from "@/lib/api";
import {
  formatErrorForDiagnostics,
  isApiRequestError,
} from "@/lib/api-request-error";
import { invalidateDashboardQueries } from "@/lib/dashboard-queries";
import {
  clearStoredPipelineTask,
  readStoredPipelineTask,
  writeStoredPipelineTask,
  type StoredPipelineTask,
} from "@/lib/pipeline-storage";
import type { PipelineTaskKind } from "@/lib/types";
import type {
  PipelineActionKey,
  PipelineRunRecord,
} from "@/components/dashboard/pipeline-result-panel";

const TASK_KIND_BY_ACTION: Record<PipelineActionKey, PipelineTaskKind> = {
  collect: "collect",
  translate: "translate",
  refreshClusters: "refresh_clusters",
  pipeline: "full_pipeline",
  resumePipeline: "resume_pipeline",
  relevanceScoring: "relevance_scoring",
  articleAnalysis: "article_analysis",
  dedupSurface: "dedup_surface",
  syndicationSimhash: "syndication_simhash",
  dedupSemantic: "dedup_semantic",
  embeddingOnly: "embedding_only",
  clusteringOnly: "clustering_only",
  clusterLabelling: "cluster_labelling",
  topicDetection: "topic_detection",
  /** Placeholder : utiliser `startSequentialChain` (jamais via `startRun`). */
  sequentialChain: "pipeline_chain",
};

/** Options pour cibler une édition (ex. analyse 5 puces depuis la page Édition). */
export type StartPipelineRunOptions = {
  editionId?: string | null;
  /** Pour analyse 5 puces : false = ne pas ré-analyser les articles déjà traités. */
  analysisForce?: boolean;
};

function buildErrorRecord(
  err: unknown,
  ctx: {
    action: PipelineActionKey;
    label: string;
    durationMs: number;
    at: string;
    taskId?: string;
    diagnostics: string[];
  },
): PipelineRunRecord {
  const message = formatErrorForDiagnostics(err);
  const lines = [...ctx.diagnostics.slice(-40)];
  if (isApiRequestError(err)) {
    lines.push(...err.toDetailLines());
  }
  return {
    action: ctx.action,
    label: ctx.label,
    ok: false,
    durationMs: ctx.durationMs,
    payload: null,
    errorMessage: message,
    at: ctx.at,
    taskId: ctx.taskId,
    errorDetailLines: lines.length > 0 ? lines : undefined,
  };
}

type RunningState = {
  key: PipelineActionKey;
  label: string;
  taskId: string;
  stepLabel: string | null;
};

type PipelineRunnerValue = {
  running: RunningState | null;
  lastRun: PipelineRunRecord | null;
  diagnostics: string[];
  startRun: (
    key: PipelineActionKey,
    label: string,
    options?: StartPipelineRunOptions,
  ) => void;
  /** Enchaîne plusieurs étapes dans l’ordre (une tâche serveur `pipeline_chain`). */
  startSequentialChain: (
    steps: PipelineTaskKind[],
    label: string,
    options?: StartPipelineRunOptions,
  ) => void;
  clearDiagnostics: () => void;
};

const PipelineRunnerContext = createContext<PipelineRunnerValue | null>(null);

export function usePipelineRunner(): PipelineRunnerValue {
  const v = useContext(PipelineRunnerContext);
  if (!v) {
    throw new Error("usePipelineRunner doit être utilisé sous PipelineRunnerProvider");
  }
  return v;
}

export function usePipelineRunnerOptional(): PipelineRunnerValue | null {
  return useContext(PipelineRunnerContext);
}

export function PipelineRunnerProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<RunningState | null>(null);
  const [lastRun, setLastRun] = useState<PipelineRunRecord | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [completionToast, setCompletionToast] = useState<string | null>(null);
  const savedTitleRef = useRef<string | null>(null);

  const inFlightTaskIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const appendDiagnostic = useCallback((line: string) => {
    const stamp = new Date().toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setDiagnostics((d) => [...d.slice(-60), `[${stamp}] ${line}`]);
  }, []);

  const clearDiagnostics = useCallback(() => {
    setDiagnostics([]);
  }, []);

  const runTrackedPoll = useCallback(
    async (
      stored: Pick<
        StoredPipelineTask,
        "taskId" | "actionKey" | "actionLabel" | "kind"
      >,
      options: { resumeSignal?: AbortSignal; startedAtMs: number },
    ) => {
      const { taskId, actionKey, actionLabel } = stored;

      if (
        inFlightTaskIdRef.current !== null &&
        inFlightTaskIdRef.current !== taskId
      ) {
        appendDiagnostic(
          "Une autre tâche pipeline est déjà suivie — impossible d’en superposer une seconde.",
        );
        return;
      }
      if (inFlightTaskIdRef.current === taskId) {
        return;
      }
      inFlightTaskIdRef.current = taskId;

      const at = new Date().toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
      });
      const diag: string[] = [];

      setRunning({
        key: actionKey,
        label: actionLabel,
        taskId,
        stepLabel: null,
      });

      try {
        const result = await pollPipelineTaskUntilDone(
          taskId,
          (s) => {
            const label = s.step_label ?? null;
            setRunning((prev) =>
              prev && prev.taskId === taskId
                ? {
                    ...prev,
                    stepLabel:
                      prev.stepLabel === label ? prev.stepLabel : label,
                  }
                : prev,
            );
          },
          {
            signal: options.resumeSignal,
            onDiagnostic: (line) => {
              diag.push(line);
              appendDiagnostic(line);
            },
          },
        );

        clearStoredPipelineTask();
        const durationMs = performance.now() - options.startedAtMs;
        setLastRun({
          action: actionKey,
          label: actionLabel,
          ok: true,
          durationMs,
          payload: result,
          at,
          taskId,
        });
        if (actionKey === "pipeline") {
          setCompletionToast("Mise à jour terminée");
          window.setTimeout(() => setCompletionToast(null), 5000);
        }
        queueMicrotask(() => {
          invalidateDashboardQueries(queryClient);
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          appendDiagnostic(
            "Reprise interrompue (cycle de vie React) — nouvelle tentative si la tâche est toujours enregistrée.",
          );
          return;
        }
        clearStoredPipelineTask();
        const durationMs = performance.now() - options.startedAtMs;
        setLastRun(
          buildErrorRecord(err, {
            action: actionKey,
            label: actionLabel,
            durationMs,
            at,
            taskId,
            diagnostics: diag,
          }),
        );
        queueMicrotask(() => {
          invalidateDashboardQueries(queryClient);
        });
      } finally {
        if (inFlightTaskIdRef.current === taskId) {
          inFlightTaskIdRef.current = null;
        }
        setRunning(null);
      }
    },
    [appendDiagnostic, queryClient],
  );

  const runTrackedPollRef = useRef(runTrackedPoll);
  runTrackedPollRef.current = runTrackedPoll;

  useEffect(() => {
    const stored = readStoredPipelineTask();
    if (!stored) return;

    const ac = new AbortController();
    const startedAtMs = performance.now() - (Date.now() - stored.startedAt);

    void runTrackedPollRef.current(stored, {
      resumeSignal: ac.signal,
      startedAtMs: Math.max(0, startedAtMs),
    });

    return () => {
      ac.abort();
    };
  }, []);

  const startSequentialChain = useCallback(
    (steps: PipelineTaskKind[], label: string, options?: StartPipelineRunOptions) => {
      if (inFlightTaskIdRef.current !== null || startingRef.current) {
        appendDiagnostic(
          "Une tâche est déjà en cours ou en démarrage. Attendez la fin.",
        );
        return;
      }
      const filtered = steps.filter((s) => s !== "pipeline_chain");
      if (filtered.length === 0) {
        appendDiagnostic("Sélectionnez au moins une étape pour la chaîne.");
        return;
      }
      const at = new Date().toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
      });
      const t0 = performance.now();
      startingRef.current = true;

      void (async () => {
        let taskId: string | undefined;
        try {
          const body: Parameters<typeof api.startPipelineTask>[0] = {
            kind: "collect",
            chain_steps: filtered,
          };
          if (options?.editionId) {
            body.edition_id = options.editionId;
          }
          if (options?.analysisForce === false) {
            body.analysis_force = false;
          }
          const { task_id } = await api.startPipelineTask(body);
          taskId = task_id;

          const stored: StoredPipelineTask = {
            v: 1,
            taskId: task_id,
            actionKey: "sequentialChain",
            actionLabel: label,
            kind: "pipeline_chain",
            startedAt: Date.now(),
          };
          writeStoredPipelineTask(stored);

          await runTrackedPollRef.current(stored, { startedAtMs: t0 });
        } catch (err) {
          clearStoredPipelineTask();
          const durationMs = performance.now() - t0;
          setLastRun(
            buildErrorRecord(err, {
              action: "sequentialChain",
              label,
              durationMs,
              at,
              taskId,
              diagnostics: [],
            }),
          );
          if (isApiRequestError(err)) {
            err.toDetailLines().forEach((l) => appendDiagnostic(l));
          }
          queueMicrotask(() => {
            invalidateDashboardQueries(queryClient);
          });
        } finally {
          startingRef.current = false;
        }
      })();
    },
    [appendDiagnostic, queryClient],
  );

  const startRun = useCallback(
    (key: PipelineActionKey, label: string, options?: StartPipelineRunOptions) => {
      if (inFlightTaskIdRef.current !== null || startingRef.current) {
        appendDiagnostic(
          "Une tâche est déjà en cours ou en démarrage. Attendez la fin.",
        );
        return;
      }

      const kind = TASK_KIND_BY_ACTION[key];
      const at = new Date().toLocaleString("fr-FR", {
        dateStyle: "short",
        timeStyle: "medium",
      });
      const t0 = performance.now();
      startingRef.current = true;

      void (async () => {
        let taskId: string | undefined;
        try {
          const body: Parameters<typeof api.startPipelineTask>[0] = { kind };
          if (key === "translate") {
            body.translate_limit = 300;
          }
          if (options?.editionId) {
            body.edition_id = options.editionId;
          }
          if (options?.analysisForce === false) {
            body.analysis_force = false;
          }
          const { task_id } = await api.startPipelineTask(body);
          taskId = task_id;

          const stored: StoredPipelineTask = {
            v: 1,
            taskId: task_id,
            actionKey: key,
            actionLabel: label,
            kind,
            startedAt: Date.now(),
          };
          writeStoredPipelineTask(stored);

          await runTrackedPollRef.current(stored, { startedAtMs: t0 });
        } catch (err) {
          clearStoredPipelineTask();
          const durationMs = performance.now() - t0;
          setLastRun(
            buildErrorRecord(err, {
              action: key,
              label,
              durationMs,
              at,
              taskId,
              diagnostics: [],
            }),
          );
          if (isApiRequestError(err)) {
            err.toDetailLines().forEach((l) => appendDiagnostic(l));
          }
          queueMicrotask(() => {
            invalidateDashboardQueries(queryClient);
          });
        } finally {
          startingRef.current = false;
        }
      })();
    },
    [appendDiagnostic, queryClient],
  );

  useEffect(() => {
    if (running) {
      if (savedTitleRef.current == null) {
        savedTitleRef.current = document.title;
      }
      document.title =
        running.key === "resumePipeline"
          ? `⏳ Reprise pipeline… | OLJ`
          : running.key === "sequentialChain"
            ? `⏳ Chaîne pipeline… | OLJ`
            : `⏳ Mise à jour… | OLJ`;
    } else if (savedTitleRef.current != null) {
      document.title = savedTitleRef.current;
      savedTitleRef.current = null;
    }
  }, [running]);

  const value = useMemo<PipelineRunnerValue>(
    () => ({
      running,
      lastRun,
      diagnostics,
      startRun,
      startSequentialChain,
      clearDiagnostics,
    }),
    [running, lastRun, diagnostics, startRun, startSequentialChain, clearDiagnostics],
  );

  return (
    <PipelineRunnerContext.Provider value={value}>
      {children}
      {completionToast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[100] max-w-sm -translate-x-1/2 rounded-md border border-border bg-background px-4 py-3 text-center text-[13px] font-medium text-foreground shadow-lg"
        >
          {completionToast}
        </div>
      ) : null}
    </PipelineRunnerContext.Provider>
  );
}
