import type {
  AppStatus,
  ArticleListResponse,
  ClusterArticlesResponse,
  ClusterListResponse,
  ClusterRefreshResponse,
  GenerateReviewResult,
  MediaSource,
  ReviewSummary,
  Stats,
} from "./types";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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

  triggerCollect: () =>
    request<{ status: string; stats: unknown }>("/api/collect", {
      method: "POST",
    }),

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
};
