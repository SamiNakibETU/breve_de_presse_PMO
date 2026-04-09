from datetime import datetime
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, Field

ArticleAnalysisDisplayState = Literal[
    "complete",
    "pending",
    "skipped_no_summary",
    "skipped_out_of_scope",
]


class ArticleIdBatchRequest(BaseModel):
    ids: list[str] = Field(..., min_length=1, max_length=100)


class ArticleResponse(BaseModel):
    id: str
    title_fr: Optional[str] = None
    title_original: str
    media_source_id: str
    media_name: str
    country: str
    country_code: str
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    article_type: Optional[str] = None
    source_language: Optional[str] = None
    translation_confidence: Optional[float] = None
    translation_notes: Optional[str] = None
    summary_fr: Optional[str] = None
    thesis_summary_fr: Optional[str] = None
    key_quotes_fr: Optional[list[str]] = None
    url: str
    status: str
    word_count: Optional[int] = None
    collected_at: datetime
    editorial_relevance: Optional[int] = None
    relevance_score: Optional[float] = None
    relevance_score_deterministic: Optional[float] = None
    relevance_band: Optional[str] = None
    why_ranked: Optional[dict[str, Any]] = None
    olj_topic_ids: Optional[list[str]] = None
    article_family: Optional[str] = None
    paywall_observed: Optional[bool] = None
    published_at_source: Optional[str] = None
    stance_summary: Optional[str] = None
    primary_editorial_event_id: Optional[str] = None
    processing_error: Optional[str] = None
    translation_failure_count: Optional[int] = None
    framing_json: Optional[dict[str, Any]] = None
    framing_actor: Optional[str] = None
    framing_tone: Optional[str] = None
    framing_prescription: Optional[str] = None
    content_translated_fr: Optional[str] = None
    content_original: Optional[str] = None
    en_translation_summary_only: Optional[bool] = None
    is_syndicated: Optional[bool] = None
    canonical_article_id: Optional[str] = None
    syndicate_siblings_count: Optional[int] = Field(
        default=None,
        description="Nombre de reprises pointant vers cet article (si group_syndicated=true)",
    )
    cluster_soft_assigned: Optional[bool] = None
    editorial_angle: Optional[str] = None
    event_tags: Optional[list[str]] = None
    is_flagship: Optional[bool] = None
    analysis_bullets_fr: Optional[list[str]] = None
    author_thesis_explicit_fr: Optional[str] = None
    factual_context_fr: Optional[str] = None
    analysis_tone: Optional[str] = None
    fact_opinion_quality: Optional[str] = None
    analysis_version: Optional[str] = None
    analyzed_at: Optional[datetime] = None
    retention_until: Optional[datetime] = None
    retention_reason: Optional[str] = None
    scrape_method: Optional[str] = None
    scrape_cascade_attempts: Optional[int] = None
    analysis_display_state: Optional[ArticleAnalysisDisplayState] = Field(
        default=None,
        description="État dérivé pour badges analyse experte (UI).",
    )
    analysis_display_hint_fr: Optional[str] = Field(
        default=None,
        description="Court libellé FR pour tooltip / badge (optionnel).",
    )
    image_url: Optional[str] = None
    image_caption: Optional[str] = None


class ArticleListResponse(BaseModel):
    articles: list[ArticleResponse]
    total: int
    counts_by_country: Optional[dict[str, int]] = None
    country_labels_fr: Optional[dict[str, str]] = Field(
        default=None,
        description="Libellés FR canoniques pour chaque code ISO présent dans counts_by_country.",
    )


class ArticleIdsRequest(BaseModel):
    ids: Annotated[list[str], Field(default_factory=list, max_length=100)]


class MediaSourceResponse(BaseModel):
    id: str
    name: str
    country: str
    country_code: str
    tier: int
    languages: list[str]
    bias: Optional[str] = None
    collection_method: str
    paywall: str
    is_active: bool
    last_collected_at: Optional[datetime] = None


class ArticleStatsResponse(BaseModel):
    """GET /api/stats — vigie 24 h UTC (articles collectés)."""

    total_collected_24h: int
    total_translated: int
    total_needs_review: int
    total_errors: int
    total_translation_abandoned: int = 0
    total_pending: int
    total_no_content: int
    articles_with_embedding_24h: int = 0
    articles_with_olj_topics_24h: int = 0
    countries_covered: int
    by_status: dict[str, int]
    by_country: dict[str, int]
    counts_by_country_code: dict[str, int] = Field(default_factory=dict)
    country_labels_fr: dict[str, str] = Field(default_factory=dict)
    by_type: dict[str, int]
    by_language: dict[str, int]
    by_media_source_top: list[dict[str, Any]] = Field(default_factory=list)
