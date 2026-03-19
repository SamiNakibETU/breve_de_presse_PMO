from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class CollectionStats(BaseModel):
    total_sources: int
    total_new: int
    errors: list[dict]


class TranslationStats(BaseModel):
    processed: int
    errors: int
    needs_review: int = 0


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
    next_run: Optional[str] = None


class StatusResponse(BaseModel):
    status: str
    environment: str
    jobs: list[SchedulerJobResponse]


class PipelineTaskKind(str, Enum):
    collect = "collect"
    translate = "translate"
    refresh_clusters = "refresh_clusters"
    full_pipeline = "full_pipeline"


class PipelineTaskStartRequest(BaseModel):
    """Démarrage d’une tâche longue suivie par GET /api/pipeline/tasks/{id}."""

    kind: PipelineTaskKind
    translate_limit: int = Field(default=300, ge=1, le=1000)


class PipelineTaskStartResponse(BaseModel):
    task_id: str
