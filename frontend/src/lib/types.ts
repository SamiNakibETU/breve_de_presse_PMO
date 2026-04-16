/** État dérivé pour badges analyse experte (GET article). */
export type ArticleAnalysisDisplayState =
  | "complete"
  | "pending"
  | "skipped_no_summary"
  | "skipped_out_of_scope";

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
  relevance_score?: number | null;
  relevance_score_deterministic?: number | null;
  relevance_band?: string | null;
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
  editorial_angle?: string | null;
  event_tags?: string[] | null;
  is_flagship?: boolean | null;
  /** Analyse experte post-traduction. */
  analysis_bullets_fr?: string[] | null;
  author_thesis_explicit_fr?: string | null;
  factual_context_fr?: string | null;
  analysis_tone?: string | null;
  fact_opinion_quality?: string | null;
  analysis_version?: string | null;
  analyzed_at?: string | null;
  retention_until?: string | null;
  retention_reason?: string | null;
  /** Corps traduit (souvent présent sur GET /api/articles/{id}). */
  content_translated_fr?: string | null;
  /** Texte source tel qu’ingéré (langue d’origine). */
  content_original?: string | null;
  framing_actor?: string | null;
  framing_tone?: string | null;
  framing_prescription?: string | null;
  analysis_display_state?: ArticleAnalysisDisplayState | null;
  analysis_display_hint_fr?: string | null;
  image_url?: string | null;
  image_caption?: string | null;
}

export interface ArticleListResponse {
  articles: Article[];
  total: number;
  counts_by_country?: Record<string, number> | null;
  country_labels_fr?: Record<string, string> | null;
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
  /** Présent si `revue_registry_only=true` : filtre registre revue OLJ. */
  revue_registry_only?: boolean;
  /** Nombre d’IDs dans le registre JSON (référence), pas forcément le nombre de lignes retournées. */
  revue_registry_count?: number;
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
  /** Compteurs par code ISO2 (source de vérité agrégats). */
  counts_by_country_code?: Record<string, number>;
  /** Libellés FR pour les codes présents dans counts_by_country_code. */
  country_labels_fr?: Record<string, string>;
  by_type: Record<string, number>;
  by_language: Record<string, number>;
  by_media_source_top?: { media_source_id: string; count: number }[];
}

export interface SchedulerJob {
  id: string;
  name: string;
  next_run: string | null;
  /** ISO 8601 UTC ; optionnel pour compatibilité avec anciennes API. */
  last_run_at?: string | null;
  last_run_ok?: boolean | null;
}

/** Plafonds batch (GET /api/status) — coûts / files. */
export interface PipelineBatchLimits {
  article_analysis_batch_limit: number;
  embedding_batch_limit: number;
  translation_pipeline_batch_limit: number;
  embed_only_editorial_types: boolean;
  embed_revue_registry_only: boolean;
}

export interface AppStatus {
  status: string;
  environment: string;
  jobs: SchedulerJob[];
  /** True si un pipeline complet tourne (cron, POST synchrone ou tâche async). */
  pipeline_running?: boolean;
  scheduler_enabled?: boolean;
  pipeline_lease_active?: boolean;
  pipeline_lease_holder_prefix?: string | null;
  pipeline_heartbeat_age_seconds?: number | null;
  batch_limits?: PipelineBatchLimits | null;
}

/** GET /api/editions/{id}/pipeline-diagnostic (clé interne). */
export interface PipelineEditionDiagnosticResponse {
  edition_id: string;
  publish_date: string;
  window_start: string | null;
  window_end: string | null;
  corpus_article_count: number;
  by_status: Record<string, number>;
  translated_pending_embedding: number;
  corpus_in_revue_registry_count: number;
  corpus_outside_revue_registry_count: number;
  revue_registry_ids_loaded: number;
  suggested_actions: { id: string; label_fr: string }[];
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
  country_code?: string | null;
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
  /** Codes pays ISO2 (régionaux prioritaires pour le Panorama). */
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
  /** Libellé pays (FR) pour affichage. */
  country: string;
  country_code: string;
  published_at: string | null;
  article_type: string | null;
  author: string | null;
  url: string;
  source_language: string | null;
  translation_confidence: number | null;
  framing_line?: string | null;
  cluster_soft_assigned?: boolean;
  analysis_bullets_fr?: string[] | null;
}

/** POST /api/articles/search/semantic */
export interface SemanticSearchHit {
  article_id: string;
  distance: number;
  title_fr: string | null;
  url: string;
  /** "vector" | "text" | "hybrid" */
  match_source: string;
  rrf_score?: number | null;
}

export interface SemanticSearchResponse {
  hits: SemanticSearchHit[];
  query: string;
  fts_count: number;
  vector_count: number;
}

export interface ClusterArticlesResponse {
  cluster_id: string;
  cluster_label: string | null;
  /** Clés = codes ISO2. */
  articles_by_country: Record<string, ClusterArticle[]>;
  total_articles: number;
  /** Codes pays régionaux présents dans le cluster. */
  countries: string[];
  international_sources?: string[];
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
  | "full_pipeline"
  | "resume_pipeline"
  | "relevance_scoring"
  | "article_analysis"
  | "dedup_surface"
  | "syndication_simhash"
  | "dedup_semantic"
  | "embedding_only"
  | "clustering_only"
  | "cluster_labelling"
  | "topic_detection"
  | "pipeline_chain";

/** GET /api/pipeline/resume-status */
export interface PipelineResumeStatus {
  edition_id: string | null;
  has_collect: boolean;
  has_translate: boolean;
  has_pipeline_summary: boolean;
  skip_collect: boolean;
  skip_translate: boolean;
  beirut_day: string;
}

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

export type EditionDetectionStatus =
  | "pending"
  | "running"
  | "done"
  | "failed";

/** Édition (parution + fenêtre de collecte). */
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
  /** Détection des sujets (pipeline LLM). */
  detection_status?: EditionDetectionStatus;
  /** Corpus éditorial dans la fenêtre d’édition (GET by-date). */
  corpus_article_count?: number | null;
  corpus_country_count?: number | null;
  /** Consignes additionnelles pour la génération revue (page Rédaction). */
  compose_instructions_fr?: string | null;
}

export interface TopicArticlePreview {
  id: string;
  title_fr: string | null;
  title_original: string;
  media_name: string;
  url: string;
  thesis_summary_fr?: string | null;
  country?: string | null;
  country_code?: string | null;
  editorial_relevance?: number | null;
  article_type?: string | null;
  source_language?: string | null;
  author?: string | null;
  editorial_angle?: string | null;
  is_flagship?: boolean | null;
  /** Puces d’analyse experte (aperçu sommaire). */
  analysis_bullets_fr?: string[] | null;
  /** Résumé éditorial (tronqué côté API pour les listes). */
  summary_fr?: string | null;
  /** Corps traduit disponible (hors résumé seul). */
  has_full_translation_fr?: boolean;
  analysis_display_state?: ArticleAnalysisDisplayState | null;
  analysis_display_hint_fr?: string | null;
  collected_at?: string | null;
}

/** GET /api/editions/{id}/selections */
export interface EditionSelectionsResponse {
  topics: Record<string, string[]>;
  extra_article_ids: string[];
  extra_articles: TopicArticlePreview[];
}

export interface EditionTopic {
  id: string;
  rank: number;
  /** Ordre personnalisé (rédaction) ; sinon null. */
  user_rank?: number | null;
  title_proposed: string;
  title_final: string | null;
  status: string;
  dominant_angle: string | null;
  counter_angle: string | null;
  editorial_note: string | null;
  /** Fil conducteur / chapô en une phrase (API éditions). */
  angle_summary?: string | null;
  country_coverage: Record<string, number> | null;
  generated_text: string | null;
  angle_id?: string | null;
  description?: string | null;
  is_multi_perspective?: boolean;
  countries?: string[] | null;
  article_count?: number | null;
  article_previews?: TopicArticlePreview[] | null;
}

export interface TopicArticleRef {
  article_id: string;
  is_selected: boolean;
  is_recommended: boolean;
  rank_in_topic: number | null;
  fit_confidence?: number | null;
  perspective_rarity?: number | null;
  display_order?: number | null;
}

/** GET /api/config/coverage-targets */
export interface CoverageTargetsResponse {
  country_codes: string[];
  labels_fr: Record<string, string>;
}

/** GET /api/config/olj-topic-labels — taxonomie thématique articles. */
export interface OljTopicLabelsResponse {
  version: string;
  labels_fr: Record<string, string>;
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
  /** Pays affichable (média). */
  country: string;
  /** Code pays ISO (média), ex. LB. */
  country_code: string;
}

export interface ClusterFallbackRow {
  cluster_id: string;
  label: string | null;
  article_count: number;
  /** Nombre de codes pays distincts (non vides). */
  country_count: number;
  /** Codes pays triés. */
  countries: string[];
  /** Nombre de médias distincts. */
  source_count: number;
  articles: ClusterFallbackArticle[];
}

/** GET /api/regie/pipeline-debug-logs */
export interface PipelineDebugLogItem {
  id: string;
  edition_id: string | null;
  step: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PipelineDebugLogsResponse {
  items: PipelineDebugLogItem[];
  total: number;
}

/** GET /api/regie/llm-call-logs */
export interface LLMCallLogItem {
  id: string;
  edition_id: string | null;
  prompt_id: string;
  prompt_version: string;
  model_used: string;
  provider?: string | null;
  temperature: number;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  has_validation_error: boolean;
  output_raw_preview: string | null;
  created_at: string;
}

export interface LLMCallLogsResponse {
  items: LLMCallLogItem[];
  total: number;
}

/** GET /api/regie/analytics/summary */
export interface AnalyticsUsageDayRow {
  day: string;
  request_count: number;
}

export interface AnalyticsUsagePathRow {
  path_template: string;
  request_count: number;
}

export interface AnalyticsProviderByDayRow {
  day: string;
  call_count: number;
  cost_usd: number;
  input_units: number;
  output_units: number;
}

export interface AnalyticsProviderByOperationRow {
  operation: string;
  kind: string;
  call_count: number;
  cost_usd: number;
  input_units: number;
  output_units: number;
}

export interface AnalyticsProviderByProviderRow {
  provider: string;
  kind: string;
  call_count: number;
  cost_usd: number;
  input_units: number;
  output_units: number;
}

export interface AnalyticsProviderByModelRow {
  provider: string;
  model: string;
  kind: string;
  call_count: number;
  cost_usd: number;
  input_units: number;
  output_units: number;
}

export interface AnalyticsProviderRecentRow {
  id: string;
  created_at: string;
  kind: string;
  provider: string;
  model: string;
  operation: string;
  status: string;
  cost_usd_est: number;
  input_units: number;
  output_units: number;
  duration_ms: number | null;
  article_id: string | null;
  edition_id: string | null;
  edition_topic_id: string | null;
}

export interface AnalyticsSummaryResponse {
  period_days: number;
  since_iso: string;
  usage_total: number;
  usage_by_day: AnalyticsUsageDayRow[];
  usage_top_paths: AnalyticsUsagePathRow[];
  provider_total_calls: number;
  provider_total_cost_usd: number;
  provider_total_input_units: number;
  provider_total_output_units: number;
  provider_by_day: AnalyticsProviderByDayRow[];
  provider_by_operation: AnalyticsProviderByOperationRow[];
  provider_by_provider: AnalyticsProviderByProviderRow[];
  provider_by_model: AnalyticsProviderByModelRow[];
  provider_recent: AnalyticsProviderRecentRow[];
  note_fr: string;
}

export interface DedupFeedbackItem {
  id: string;
  article_id: string;
  note: string;
  created_at: string;
}
