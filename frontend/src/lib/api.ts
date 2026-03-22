import {
  ApiRequestError,
  formatErrorForDiagnostics,
  isApiRequestError,
} from "./api-request-error";
import type {
  AppStatus,
  ArticleListResponse,
  ClusterArticlesResponse,
  ClusterFallbackRow,
  ClusterListResponse,
  ClusterRefreshResponse,
  Edition,
  EditionTopic,
  EditionTopicDetailResponse,
  GenerateAllResponse,
  GenerateTopicResponse,
  GenerateReviewResult,
  MediaSource,
  MediaSourcesHealthResponse,
  PipelineTaskKind,
  PipelineTaskStartResponse,
  PipelineTaskStatus,
  ReviewSummary,
  Stats,
} from "./types";

/** `direct` = navigateur → API FastAPI. `proxy` = BFF Next (`/api/proxy/...`, clé serveur uniquement). */
const API_MODE = process.env.NEXT_PUBLIC_API_MODE ?? "direct";

function resolveUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (API_MODE === "proxy") {
    return `/api/proxy${p}`;
  }
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
    /\/+$/,
    "",
  );
  return `${base}${p}`;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (API_MODE !== "proxy") {
    const key =
      process.env.NEXT_PUBLIC_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_INTERNAL_API_KEY?.trim();
    if (key) h.Authorization = `Bearer ${key}`;
  }
  const editor = process.env.NEXT_PUBLIC_EDITOR_ID;
  if (editor) h["X-Editor-ID"] = editor;
  return h;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  let res: Response;
  try {
    res = await fetch(resolveUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    const msg =
      e instanceof TypeError
        ? `Réseau indisponible (${e.message})`
        : `Échec réseau : ${formatErrorForDiagnostics(e)}`;
    throw new Error(`${method} ${path} — ${msg}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const preview = body.length > 800 ? `${body.slice(0, 800)}…` : body;
    throw new ApiRequestError(
      preview || `HTTP ${res.status}`,
      {
        path,
        method,
        status: res.status,
        responseBody: body,
      },
    );
  }
  return res.json() as Promise<T>;
}

function isRecoverablePollError(e: unknown): boolean {
  if (e instanceof ApiRequestError) {
    if (e.status === 404) return false;
    return e.status >= 500 || e.status === 429 || e.status === 408;
  }
  if (e instanceof TypeError) return true;
  if (e instanceof Error && e.name === "AbortError") return false;
  if (e instanceof Error && /réseau|network|fetch/i.test(e.message)) {
    return true;
  }
  return false;
}

/**
 * Attend la fin d’une tâche pipeline (polling). Réessaie sur erreurs réseau / 5xx / 429.
 * `signal` : annulation (ex. React Strict Mode — ne pas effacer la tâche côté serveur).
 */
export async function pollPipelineTaskUntilDone(
  taskId: string,
  onProgress: (s: PipelineTaskStatus) => void,
  options?: {
    signal?: AbortSignal;
    onDiagnostic?: (line: string) => void;
  },
): Promise<unknown> {
  let delayMs = 1400;
  const maxDelayMs = 4500;
  const backoffFactor = 1.12;
  let networkStreak = 0;

  for (;;) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    let s: PipelineTaskStatus;
    try {
      s = await request<PipelineTaskStatus>(`/api/pipeline/tasks/${taskId}`);
      networkStreak = 0;
    } catch (e) {
      if (options?.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (isApiRequestError(e) && e.status === 404) {
        throw new Error(
          `Tâche pipeline introuvable (id ${taskId}). Elle a peut‑être expiré après un redémarrage serveur.`,
        );
      }
      if (!isRecoverablePollError(e)) {
        const base = formatErrorForDiagnostics(e);
        throw new Error(`Polling tâche ${taskId} : ${base}`);
      }
      networkStreak += 1;
      options?.onDiagnostic?.(
        `Réseau / serveur (#${networkStreak}) : ${formatErrorForDiagnostics(e)} — nouvel essai.`,
      );
      const wait = Math.min(
        60_000,
        Math.round(2000 * Math.pow(1.45, Math.min(networkStreak, 10))),
      );
      try {
        await sleep(wait, options?.signal);
      } catch (abortErr) {
        if (abortErr instanceof DOMException && abortErr.name === "AbortError") {
          throw abortErr;
        }
        throw abortErr;
      }
      continue;
    }

    onProgress(s);

    if (s.status === "done") {
      const r = s.result;
      if (r == null || typeof r !== "object") {
        throw new Error(
          `Tâche ${taskId} terminée mais résultat vide ou invalide (kind=${s.kind}).`,
        );
      }
      return r;
    }
    if (s.status === "error") {
      const errText = s.error?.trim() || "erreur inconnue";
      throw new Error(`Tâche pipeline ${taskId} (étape « ${s.step_label} ») : ${errText}`);
    }

    try {
      await sleep(delayMs, options?.signal);
    } catch (abortErr) {
      if (abortErr instanceof DOMException && abortErr.name === "AbortError") {
        throw abortErr;
      }
      throw abortErr;
    }
    delayMs = Math.min(maxDelayMs, Math.round(delayMs * backoffFactor));
  }
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  status: () => request<AppStatus>("/api/status"),

  stats: () => request<Stats>("/api/stats"),

  articles: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<ArticleListResponse>(`/api/articles${qs}`);
  },

  articlesByIds: (ids: string[]) =>
    request<ArticleListResponse>("/api/articles/by-ids", {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),

  mediaSources: () => request<MediaSource[]>("/api/media-sources"),

  mediaSourcesHealth: () =>
    request<MediaSourcesHealthResponse>("/api/media-sources/health"),

  triggerCollect: () =>
    request<{ status: string; stats: unknown }>("/api/collect", {
      method: "POST",
    }),

  /** Démarre une tâche longue (collecte, traduction, clusters, pipeline complet). */
  startPipelineTask: (body: {
    kind: PipelineTaskKind;
    translate_limit?: number;
  }) =>
    request<PipelineTaskStartResponse>("/api/pipeline/tasks", {
      method: "POST",
      body: JSON.stringify({
        kind: body.kind,
        translate_limit: body.translate_limit ?? 300,
      }),
    }),

  getPipelineTask: (taskId: string) =>
    request<PipelineTaskStatus>(`/api/pipeline/tasks/${taskId}`),

  /**
   * Démarre puis poll jusqu’à fin. Préférer `pollPipelineTaskUntilDone` + persistance
   * si le suivi doit survivre à une navigation (voir PipelineRunnerProvider).
   */
  runPipelineTaskWithProgress: async (
    kind: PipelineTaskKind,
    onProgress: (s: PipelineTaskStatus) => void,
    options?: { translateLimit?: number; signal?: AbortSignal },
  ): Promise<unknown> => {
    const { task_id } = await request<PipelineTaskStartResponse>(
      "/api/pipeline/tasks",
      {
        method: "POST",
        body: JSON.stringify({
          kind,
          translate_limit: options?.translateLimit ?? 300,
        }),
      },
    );
    return pollPipelineTaskUntilDone(task_id, onProgress, {
      signal: options?.signal,
    });
  },

  triggerTranslate: () =>
    request<{ status: string; stats: unknown }>("/api/translate", {
      method: "POST",
    }),

  triggerPipeline: () =>
    request<{ status: string; stats: unknown }>("/api/pipeline", {
      method: "POST",
    }),

  generateReview: (articleIds: string[]) =>
    request<GenerateReviewResult>("/api/reviews/generate", {
      method: "POST",
      body: JSON.stringify({ article_ids: articleIds }),
    }),

  reviews: () =>
    request<{ reviews: ReviewSummary[] }>("/api/reviews"),

  review: (id: string) => request<ReviewSummary>(`/api/reviews/${id}`),

  clusters: () => request<ClusterListResponse>("/api/clusters"),

  clusterArticles: (clusterId: string) =>
    request<ClusterArticlesResponse>(`/api/clusters/${clusterId}/articles`),

  refreshClusters: () =>
    request<ClusterRefreshResponse>("/api/clusters/refresh", {
      method: "POST",
    }),

  batchRetryTranslation: (ids: string[]) =>
    request<{ status: string; updated: number }>(
      "/api/articles/batch-retry-translation",
      { method: "POST", body: JSON.stringify({ ids }) },
    ),

  batchAbandonTranslation: (ids: string[]) =>
    request<{ status: string; updated: number }>(
      "/api/articles/batch-abandon-translation",
      { method: "POST", body: JSON.stringify({ ids }) },
    ),

  batchMarkReviewed: (ids: string[]) =>
    request<{ status: string; updated: number }>(
      "/api/articles/batch-mark-reviewed",
      { method: "POST", body: JSON.stringify({ ids }) },
    ),

  editionByDate: (publishDate: string) =>
    request<Edition>(`/api/editions/by-date/${publishDate}`),

  editionTopics: (editionId: string) =>
    request<EditionTopic[]>(`/api/editions/${editionId}/topics`),

  editionTopicDetail: (editionId: string, topicId: string) =>
    request<EditionTopicDetailResponse>(
      `/api/editions/${editionId}/topics/${topicId}`,
    ),

  editionTopicSelection: (
    editionId: string,
    topicId: string,
    selectedArticleIds: string[],
  ) =>
    request<{ status: string; updated: number }>(
      `/api/editions/${editionId}/topics/${topicId}/selection`,
      {
        method: "PATCH",
        body: JSON.stringify({ selected_article_ids: selectedArticleIds }),
      },
    ),

  editionTopicGenerate: (
    editionId: string,
    topicId: string,
    articleIds?: string[] | null,
  ) =>
    request<GenerateTopicResponse>(
      `/api/editions/${editionId}/topics/${topicId}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          articleIds && articleIds.length > 0 ? { article_ids: articleIds } : {},
        ),
      },
    ),

  editionGenerateAll: (editionId: string) =>
    request<GenerateAllResponse>(
      `/api/editions/${editionId}/generate-all`,
      { method: "POST" },
    ),

  editionCurate: (editionId: string) =>
    request<unknown>(`/api/editions/${editionId}/curate`, { method: "POST" }),

  editionClustersFallback: (editionId: string) =>
    request<ClusterFallbackRow[]>(
      `/api/editions/${editionId}/clusters-fallback`,
    ),
};
