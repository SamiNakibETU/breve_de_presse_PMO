import type {
  AppStatus,
  ArticleListResponse,
  ClusterArticlesResponse,
  ClusterListResponse,
  ClusterRefreshResponse,
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
    const key = process.env.NEXT_PUBLIC_INTERNAL_API_KEY;
    if (key) h["X-Internal-Key"] = key;
  }
  const editor = process.env.NEXT_PUBLIC_EDITOR_ID;
  if (editor) h["X-Editor-ID"] = editor;
  return h;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
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
   * Polling ~900 ms jusqu’à fin. `result` = corps final (forme selon `kind`).
   */
  runPipelineTaskWithProgress: async (
    kind: PipelineTaskKind,
    onProgress: (s: PipelineTaskStatus) => void,
    options?: { translateLimit?: number },
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
    const pollMs = 900;
    for (;;) {
      const s = await request<PipelineTaskStatus>(
        `/api/pipeline/tasks/${task_id}`,
      );
      onProgress(s);
      if (s.status === "done") {
        const r = s.result;
        if (r == null || typeof r !== "object") {
          throw new Error("Réponse tâche vide");
        }
        return r;
      }
      if (s.status === "error") {
        throw new Error(s.error ?? "Erreur tâche pipeline");
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, pollMs);
      });
    }
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
};
