export interface Article {
  id: string;
  title_fr: string | null;
  title_original: string;
  media_source_id: string;
  media_name: string;
  country: string;
  country_code: string;
  author: string | null;
  published_at: string | null;
  article_type: string | null;
  source_language: string | null;
  translation_confidence: number | null;
  translation_notes: string | null;
  summary_fr: string | null;
  thesis_summary_fr: string | null;
  key_quotes_fr: string[] | null;
  url: string;
  status: string;
  word_count: number | null;
  collected_at: string;
  editorial_relevance: number | null;
  why_ranked?: Record<string, unknown> | null;
  olj_topic_ids?: string[] | null;
  article_family?: string | null;
  paywall_observed?: boolean | null;
  published_at_source?: string | null;
  stance_summary?: string | null;
  primary_editorial_event_id?: string | null;
  processing_error?: string | null;
  translation_failure_count?: number | null;
  framing_json?: Record<string, string> | null;
  en_translation_summary_only?: boolean | null;
  is_syndicated?: boolean | null;
  canonical_article_id?: string | null;
  /** Présent si l’API est appelée avec group_syndicated=true */
  syndicate_siblings_count?: number | null;
  cluster_soft_assigned?: boolean | null;
}

export interface ArticleListResponse {
  articles: Article[];
  total: number;
  counts_by_country?: Record<string, number> | null;
}

export interface MediaSource {
  id: string;
  name: string;
  country: string;
  country_code: string;
  tier: number;
  languages: string[];
  bias: string | null;
  collection_method: string;
  paywall: string;
  is_active: boolean;
  last_collected_at: string | null;
}

/** Réponse GET /api/media-sources/health */
export interface MediaSourceHealthRow {
  id: string;
  name: string;
  country_code: string;
  tier?: number;
  tier_band?: string;
  articles_72h: number;
  last_collected_at: string | null;
  health_status: string;
  consecutive_empty_collection_runs?: number;
  last_article_ingested_at?: string | null;
  last_24h_translated_count?: number;
  translation_24h_ok_persisted?: number | null;
  translation_24h_errors_persisted?: number | null;
  translation_24h_metrics_at?: string | null;
  health_metrics?: Record<string, unknown> | null;
  last_collection?: Record<string, unknown> | null;
  /** Présent si ce média partage les compteurs avec d'autres IDs */
  alias_aggregate_ids?: string[];
}

export interface MediaSourcesHealthResponse {
  sources: MediaSourceHealthRow[];
  window_hours: number;
  critical_p0_sources_down?: number;
  /** Note API : agrégation des fiches médias doublon (IDs alias) */
  translation_metrics_note_fr?: string;
}

export interface Stats {
  total_collected_24h: number;
  total_translated: number;
  total_needs_review: number;
  total_errors: number;
  total_translation_abandoned?: number;
  total_pending: number;
  total_no_content: number;
  articles_with_embedding_24h?: number;
  articles_with_olj_topics_24h?: number;
  countries_covered: number;
  by_status: Record<string, number>;
  by_country: Record<string, number>;
  by_type: Record<string, number>;
  by_language: Record<string, number>;
  by_media_source_top?: { media_source_id: string; count: number }[];
}

export interface SchedulerJob {
  id: string;
  name: string;
  next_run: string | null;
}

export interface AppStatus {
  status: string;
  environment: string;
  jobs: SchedulerJob[];
}

export interface ReviewSummary {
  id: string;
  title: string | null;
  review_date: string;
  status: string;
  full_text: string | null;
  article_count: number;
  created_at: string;
  created_by?: string | null;
  supersedes_id?: string | null;
  content_snapshot_hash?: string | null;
  generation_prompt_hash?: string | null;
}

export interface GenerateReviewResult {
  review_id: string;
  full_text: string;
  article_count: number;
}

export interface ThesisPreviewItem {
  thesis: string;
  media_name?: string | null;
  article_type?: string | null;
  author?: string | null;
  country?: string | null;
  source_language?: string | null;
}

export interface TopicCluster {
  id: string;
  label: string | null;
  article_count: number;
  country_count: number;
  avg_relevance: number;
  latest_article_at: string | null;
  is_active: boolean;
  countries: string[];
  is_emerging?: boolean;
  thesis_previews?: ThesisPreviewItem[] | string[];
}

export interface ClusterListResponse {
  clusters: TopicCluster[];
  total: number;
  noise_count: number;
}

export interface ClusterArticle {
  id: string;
  title_fr: string | null;
  title_original: string;
  thesis_summary_fr?: string | null;
  summary_fr: string | null;
  source_name: string | null;
  country: string;
  published_at: string | null;
  article_type: string | null;
  author: string | null;
  url: string;
  source_language: string | null;
  translation_confidence: number | null;
  framing_line?: string | null;
  cluster_soft_assigned?: boolean;
}

export interface ClusterArticlesResponse {
  cluster_id: string;
  cluster_label: string | null;
  articles_by_country: Record<string, ClusterArticle[]>;
  total_articles: number;
  countries: string[];
}

export interface ClusterRefreshResponse {
  clusters_created: number;
  articles_clustered: number;
  articles_embedded: number;
  clusters_labeled: number;
  insights_updated?: number;
}

export type PipelineTaskKind =
  | "collect"
  | "translate"
  | "refresh_clusters"
  | "full_pipeline";

export interface PipelineTaskStartResponse {
  task_id: string;
}

/** Tâche pipeline suivie par polling (ex. collecte avec progression). */
export interface PipelineTaskStatus {
  task_id: string;
  kind: string;
  status: "pending" | "running" | "done" | "error";
  step_key: string;
  step_label: string;
  /** Objet final : `{ status, stats }` ou réponse clusters à plat selon la tâche. */
  result: unknown;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** MEMW v2 — édition */
export interface Edition {
  id: string;
  publish_date: string;
  window_start: string;
  window_end: string;
  timezone: string;
  target_topics_min: number;
  target_topics_max: number;
  status: string;
  curator_run_id: string | null;
  pipeline_trace_id: string | null;
  generated_text: string | null;
}

export interface EditionTopic {
  id: string;
  rank: number;
  title_proposed: string;
  title_final: string | null;
  status: string;
  dominant_angle: string | null;
  counter_angle: string | null;
  editorial_note: string | null;
  country_coverage: Record<string, number> | null;
  generated_text: string | null;
}

export interface TopicArticleRef {
  article_id: string;
  is_selected: boolean;
  is_recommended: boolean;
  rank_in_topic: number | null;
}

export interface EditionTopicDetailResponse {
  topic: EditionTopic;
  article_ids: string[];
  article_refs: TopicArticleRef[];
}

export interface GenerateTopicResponse {
  status: string;
  edition_topic_id?: string;
  generated_text?: string | null;
  llm_call_log_id?: string;
  article_count?: number;
  detail?: string;
}

export interface GenerateAllResponse {
  status: string;
  topics_ok: number;
  topics_failed: string[];
  generated_text: string | null;
}

export interface ClusterFallbackArticle {
  id: string;
  title: string;
  source: string;
}

export interface ClusterFallbackRow {
  cluster_id: string;
  label: string | null;
  article_count: number;
  articles: ClusterFallbackArticle[];
}
