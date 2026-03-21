import type { PipelineActionKey } from "@/components/dashboard/pipeline-result-panel";
import type { PipelineTaskKind } from "@/lib/types";

const STORAGE_KEY = "memwatch_pipeline_v1";

export type StoredPipelineTask = {
  v: 1;
  taskId: string;
  actionKey: PipelineActionKey;
  actionLabel: string;
  kind: PipelineTaskKind;
  startedAt: number;
};

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function readStoredPipelineTask(): StoredPipelineTask | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StoredPipelineTask;
    if (data.v !== 1 || !data.taskId || !data.actionKey || !data.kind) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() - data.startedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeStoredPipelineTask(data: StoredPipelineTask): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredPipelineTask(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
