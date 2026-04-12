import {
  ApiRequestError,
  formatErrorForDiagnostics,
  isApiRequestError,
} from "./api-request-error";
import type {
  AnalyticsSummaryResponse,
  AppStatus,
  Article,
  ArticleListResponse,
  ClusterArticlesResponse,
  ClusterFallbackRow,
  ClusterListResponse,
  DedupFeedbackItem,
  ClusterRefreshResponse,
  CoverageTargetsResponse,
  OljTopicLabelsResponse,
  Edition,
  EditionSelectionsResponse,
  EditionTopic,
  EditionTopicDetailResponse,
  GenerateAllResponse,
  GenerateTopicResponse,
  LLMCallLogsResponse,
  GenerateReviewResult,
  MediaSource,
  MediaSourcesHealthResponse,
  PipelineDebugLogsResponse,
  PipelineEditionDiagnosticResponse,
  PipelineResumeStatus,
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

type RequestOptions = RequestInit & { timeoutMs?: number };

function mergeAbortSignals(
  a: AbortSignal | undefined,
  b: AbortSignal | undefined,
): AbortSignal | undefined {
  if (!a && !b) return undefined;
  if (a && !b) return a;
  if (b && !a) return b;
  const c = new AbortController();
  const onAbort = (): void => {
    c.abort();
  };
  a!.addEventListener("abort", onAbort, { once: true });
  b!.addEventListener("abort", onAbort, { once: true });
  return c.signal;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const { timeoutMs, signal: incomingSignal, ...restInit } = init ?? {};
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutController = new AbortController();
  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
  }
  const signal = mergeAbortSignals(
    incomingSignal ?? undefined,
    timeoutController.signal,
  );
  let res: Response;
  try {
    res = await fetch(resolveUrl(path), {
      ...restInit,
      signal,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(restInit.headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    const isAbort =
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError");
    if (isAbort) {
      const reason =
        timeoutMs != null && timeoutMs > 0
          ? `Délai dépassé (${Math.round(timeoutMs / 1000)} s)`
          : "Requête annulée";
      throw new Error(`${method} ${path} — ${reason}`);
    }
    const msg =
      e instanceof TypeError
        ? `Réseau indisponible (${e.message})`
        : `Échec réseau : ${formatErrorForDiagnostics(e)}`;
    throw new Error(`${method} ${path} — ${msg}`);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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

  coverageTargets: () =>
    request<CoverageTargetsResponse>("/api/config/coverage-targets"),

  oljTopicLabels: () =>
    request<OljTopicLabelsResponse>("/api/config/olj-topic-labels"),

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

  articleById: (articleId: string) =>
    request<Article>(`/api/articles/${encodeURIComponent(articleId)}`),

  mediaSources: () => request<MediaSource[]>("/api/media-sources"),

  /** Santé des sources : agrégats lourds ; timeout client 120 s (voir backend optimisé). */
  mediaSourcesHealth: (
    signal?: AbortSignal,
    opts?: { revueRegistryOnly?: boolean },
  ) =>
    request<MediaSourcesHealthResponse>(
      `/api/media-sources/health${opts?.revueRegistryOnly ? "?revue_registry_only=true" : ""}`,
      {
        signal,
        timeoutMs: 120_000,
      },
    ),

  triggerCollect: () =>
    request<{ status: string; stats: unknown }>("/api/collect", {
      method: "POST",
    }),

  /** Démarre une tâche longue (collecte, traduction, clusters, pipeline complet, étapes unitaires). */
  startPipelineTask: (body: {
    kind: PipelineTaskKind;
    chain_steps?: PipelineTaskKind[] | null;
    translate_limit?: number | null;
    edition_id?: string | null;
    /** Date calendaire YYYY-MM-DD ; résout edition_id automatiquement si edition_id absent. */
    publish_date?: string | null;
    analysis_force?: boolean;
  }) => {
    const payload: Record<string, unknown> = { kind: body.kind };
    if (body.chain_steps != null && body.chain_steps.length > 0) {
      payload.chain_steps = body.chain_steps;
    }
    if (body.translate_limit != null) {
      payload.translate_limit = body.translate_limit;
    }
    if (body.edition_id != null && body.edition_id !== "") {
      payload.edition_id = body.edition_id;
    }
    if (body.publish_date != null && body.publish_date !== "" && !body.edition_id) {
      payload.publish_date = body.publish_date;
    }
    if (body.analysis_force === false) {
      payload.analysis_force = false;
    }
    return request<PipelineTaskStartResponse>("/api/pipeline/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

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
    const payload: Record<string, unknown> = { kind };
    if (kind === "translate") {
      payload.translate_limit = options?.translateLimit ?? 300;
    }
    const { task_id } = await request<PipelineTaskStartResponse>(
      "/api/pipeline/tasks",
      {
        method: "POST",
        body: JSON.stringify(payload),
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

  /** Reprise : saute collecte/traduction si déjà loguées ce jour (Asia/Beirut). */
  triggerPipelineResume: () =>
    request<{ status: string; stats: unknown }>("/api/pipeline/resume", {
      method: "POST",
    }),

  pipelineResumeStatus: () =>
    request<PipelineResumeStatus>("/api/pipeline/resume-status"),

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

  editionSelections: (editionId: string) =>
    request<EditionSelectionsResponse>(
      `/api/editions/${editionId}/selections`,
    ),

  editionPipelineDiagnostic: (editionId: string) =>
    request<PipelineEditionDiagnosticResponse>(
      `/api/editions/${editionId}/pipeline-diagnostic`,
    ),

  editionTopics: (
    editionId: string,
    opts?: {
      includeArticlePreviews?: boolean;
      maxArticlePreviewsPerTopic?: number;
    },
  ) => {
    const q = new URLSearchParams();
    if (opts?.includeArticlePreviews === true) {
      q.set("include_article_previews", "true");
    }
    if (opts?.maxArticlePreviewsPerTopic != null) {
      q.set(
        "max_article_previews_per_topic",
        String(opts.maxArticlePreviewsPerTopic),
      );
    }
    const qs = q.toString();
    return request<EditionTopic[]>(
      `/api/editions/${editionId}/topics${qs ? `?${qs}` : ""}`,
    );
  },

  editionDetectTopics: (editionId: string) =>
    request<{
      status: string;
      topics_created: number;
      detection_status: string;
    }>(`/api/editions/${editionId}/detect-topics`, { method: "POST" }),

  editionAnalyze: (
    editionId: string,
    opts?: { force?: boolean },
  ) =>
    request<Record<string, unknown>>(
      `/api/editions/${editionId}/analyze?force=${opts?.force !== false ? "true" : "false"}`,
      { method: "POST" },
    ),

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

  editionTopicPatch: (
    editionId: string,
    topicId: string,
    body: { user_rank?: number | null },
  ) =>
    request<EditionTopic>(`/api/editions/${editionId}/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  editionComposePreferences: (
    editionId: string,
    body: {
      extra_selected_article_ids?: string[];
      compose_instructions_fr?: string;
    },
  ) =>
    request<{ status: string }>(
      `/api/editions/${editionId}/compose-preferences`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),

  editionTopicGenerate: (
    editionId: string,
    topicId: string,
    articleIds?: string[] | null,
    instructionSuffix?: string | null,
  ) => {
    const payload: Record<string, unknown> = {};
    if (articleIds && articleIds.length > 0) {
      payload.article_ids = articleIds;
    }
    const suf = (instructionSuffix ?? "").trim();
    if (suf) {
      payload.instruction_suffix = suf;
    }
    return request<GenerateTopicResponse>(
      `/api/editions/${editionId}/topics/${topicId}/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  },

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

  regiePipelineDebugLogs: (params?: {
    edition_id?: string;
    step?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.edition_id) q.set("edition_id", params.edition_id);
    if (params?.step) q.set("step", params.step);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    return request<PipelineDebugLogsResponse>(
      `/api/regie/pipeline-debug-logs${qs ? `?${qs}` : ""}`,
    );
  },

  regieAnalyticsSummary: (days = 7) =>
    request<AnalyticsSummaryResponse>(
      `/api/regie/analytics/summary?days=${encodeURIComponent(String(days))}`,
    ),

  regieLlmCallLogs: (params?: {
    edition_id?: string;
    prompt_id?: string;
    limit?: number;
    offset?: number;
    include_raw?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.edition_id) q.set("edition_id", params.edition_id);
    if (params?.prompt_id) q.set("prompt_id", params.prompt_id);
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.offset != null) q.set("offset", String(params.offset));
    if (params?.include_raw) q.set("include_raw", "true");
    const qs = q.toString();
    return request<LLMCallLogsResponse>(
      `/api/regie/llm-call-logs${qs ? `?${qs}` : ""}`,
    );
  },

  regieDedupFeedbackList: (limit = 40) =>
    request<DedupFeedbackItem[]>(`/api/regie/dedup-feedback?limit=${limit}`),

  regieDedupFeedbackCreate: (body: { article_id: string; note: string }) =>
    request<DedupFeedbackItem>("/api/regie/dedup-feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createCustomEdition: (body: {
    publish_date: string;
    window_start: string;
    window_end: string;
    label?: string;
  }) =>
    request<Edition>("/api/editions/custom", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  runCustomEditionPipeline: (
    editionId: string,
    body?: {
      run_analysis?: boolean;
      run_topic_detection?: boolean;
      analysis_force?: boolean;
    },
  ) =>
    request<{
      edition_id: string;
      analysis?: unknown;
      topics_created?: number;
      detection_status?: string;
    }>(`/api/editions/${editionId}/run-custom-pipeline`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
};
