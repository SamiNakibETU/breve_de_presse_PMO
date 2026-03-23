"""Configuration exposée au frontend (pays cibles couverture, etc.)."""

from typing import Any

from fastapi import APIRouter

from src.services.country_utils import COUNTRY_CANONICAL, COVERAGE_TARGET_COUNTRIES
from src.services.olj_taxonomy import get_taxonomy_version, get_topic_labels_fr

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/coverage-targets")
async def get_coverage_targets() -> dict[str, Any]:
    codes = list(COVERAGE_TARGET_COUNTRIES)
    return {
        "country_codes": codes,
        "labels_fr": {c: COUNTRY_CANONICAL.get(c, c) for c in codes},
    }


@router.get("/olj-topic-labels")
async def get_olj_topic_labels() -> dict[str, Any]:
    """Libellés français des thèmes OLJ (taxonomie articles)."""
    return {
        "version": get_taxonomy_version(),
        "labels_fr": get_topic_labels_fr(),
    }
