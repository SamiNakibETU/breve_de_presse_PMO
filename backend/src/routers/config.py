"""Configuration exposée au frontend (pays cibles couverture, etc.)."""

from typing import Any

from fastapi import APIRouter

from src.services.country_utils import COUNTRY_CANONICAL, COVERAGE_TARGET_COUNTRIES

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("/coverage-targets")
async def get_coverage_targets() -> dict[str, Any]:
    codes = list(COVERAGE_TARGET_COUNTRIES)
    return {
        "country_codes": codes,
        "labels_fr": {c: COUNTRY_CANONICAL.get(c, c) for c in codes},
    }
