from datetime import date
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class CollectionStats(BaseModel):
    total_sources: int
    total_new: int
    errors: list[dict]
    error_breakdown: dict[str, int] | None = None


class TranslationStats(BaseModel):
    processed: int
    errors: int
    needs_review: int = 0
    skipped: int = 0
    error_breakdown: dict[str, int] | None = None
    error_samples: list[dict] | None = None


class PipelineResponse(BaseModel):
    status: str
    collection: Optional[CollectionStats] = None
    translation: Optional[TranslationStats] = None
    elapsed_seconds: Optional[float] = None


class StatsResponse(BaseModel):
    total_collected_24h: int
    total_translated: int
    total_needs_review: int
    total_errors: int
    countries_covered: int
    by_country: dict[str, int]
    by_type: dict[str, int]
    by_language: dict[str, int]


class SchedulerJobResponse(BaseModel):
    id: str
    name: str
    next_run: Optional[str] = Field(
        default=None,
        description="Prochaine exécution planifiée (chaîne renvoyée par APScheduler).",
    )
    last_run_at: Optional[str] = Field(
        default=None,
        description="ISO 8601 UTC : fin de la dernière exécution enregistrée pour ce processus.",
    )
    last_run_ok: Optional[bool] = Field(
        default=None,
        description="True si succès, False si erreur, null si aucune exécution depuis le boot.",
    )


class PipelineBatchLimits(BaseModel):
    """Plafonds batch (liens coûts / files d’attente) — exposés pour la Régie."""

    article_analysis_batch_limit: int
    embedding_batch_limit: int
    translation_pipeline_batch_limit: int
    embed_only_editorial_types: bool
    embed_revue_registry_only: bool


class StatusResponse(BaseModel):
    status: str
    environment: str
    jobs: list[SchedulerJobResponse]
    pipeline_running: bool = Field(
        default=False,
        description="True si un pipeline complet (cron, POST /api/pipeline ou tâche async) est en cours.",
    )
    scheduler_enabled: bool = Field(
        default=True,
        description="False si APScheduler est désactivé sur ce processus.",
    )
    pipeline_lease_active: bool = Field(
        default=False,
        description="Un lease Postgres pipeline non expiré (autre instance ou celle-ci).",
    )
    pipeline_lease_holder_prefix: str | None = Field(
        default=None,
        description="Préfixe du holder_id actif (opaque), si lease actif.",
    )
    pipeline_heartbeat_age_seconds: float | None = Field(
        default=None,
        description="Âge du dernier heartbeat lease (s) si lease actif ; null sinon.",
    )
    batch_limits: Optional[PipelineBatchLimits] = Field(
        default=None,
        description="Plafonds configurés (cohérence coûts / badges « hors batch »).",
    )


class PipelineTaskKind(str, Enum):
    collect = "collect"
    translate = "translate"
    refresh_clusters = "refresh_clusters"
    full_pipeline = "full_pipeline"
    resume_pipeline = "resume_pipeline"
    relevance_scoring = "relevance_scoring"
    article_analysis = "article_analysis"
    dedup_surface = "dedup_surface"
    syndication_simhash = "syndication_simhash"
    dedup_semantic = "dedup_semantic"
    embedding_only = "embedding_only"
    clustering_only = "clustering_only"
    cluster_labelling = "cluster_labelling"
    topic_detection = "topic_detection"


class PipelineResumeStatusResponse(BaseModel):
    """État des étapes journalisées aujourd’hui (Asia/Beirut) pour l’édition courante."""

    edition_id: str | None = None
    has_collect: bool
    has_translate: bool
    has_pipeline_summary: bool
    skip_collect: bool
    skip_translate: bool
    beirut_day: str = Field(description="Date calendaire Beyrouth (ISO YYYY-MM-DD).")


class PipelineTaskStartRequest(BaseModel):
    """Démarrage d’une tâche longue suivie par GET /api/pipeline/tasks/{id}."""

    kind: PipelineTaskKind
    chain_steps: list[PipelineTaskKind] | None = Field(
        default=None,
        max_length=40,
        description=(
            "Si défini (non vide) : exécute ces étapes dans l’ordre, une seule tâche parente "
            "(kind enregistré « pipeline_chain »). ``full_pipeline`` / ``resume_pipeline`` "
            "ne peuvent figurer qu’isolément."
        ),
    )
    translate_limit: int | None = Field(
        default=None,
        description="Pour kind=translate : plafond articles (1–1000) ; null = TRANSLATION_PIPELINE_BATCH_LIMIT",
    )
    edition_id: UUID | None = Field(
        default=None,
        description="Édition cible pour les étapes unitaires ; omis = édition courante (serveur).",
    )
    publish_date: date | None = Field(
        default=None,
        description=(
            "Date calendaire YYYY-MM-DD : résout automatiquement edition_id si celui-ci est omis. "
            "Permet de cibler une édition passée sans connaître son UUID."
        ),
    )
    analysis_force: bool = Field(
        default=True,
        description="Pour kind=article_analysis : ré-analyser les articles déjà marqués analysés.",
    )

    @field_validator("translate_limit")
    @classmethod
    def _translate_limit_bounds(cls, v: int | None) -> int | None:
        if v is not None and not (1 <= v <= 1000):
            raise ValueError("translate_limit must be between 1 and 1000")
        return v

    @model_validator(mode="after")
    def _chain_steps_rules(self) -> "PipelineTaskStartRequest":
        if not self.chain_steps:
            return self
        vals = [s.value for s in self.chain_steps]
        if not vals:
            raise ValueError("chain_steps ne peut pas être une liste vide")
        heavy = frozenset({"full_pipeline", "resume_pipeline"})
        bad = [x for x in vals if x in heavy]
        if bad and len(vals) > 1:
            raise ValueError(
                "full_pipeline et resume_pipeline ne peuvent pas être mélangés "
                "à d'autres étapes dans chain_steps",
            )
        return self


class PipelineTaskStartResponse(BaseModel):
    task_id: str
