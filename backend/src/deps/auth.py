"""Auth interne optionnelle (clé partagée) pour endpoints sensibles."""

from typing import Annotated, Optional

from fastapi import Header, HTTPException

from src.config import get_settings


async def require_internal_key(
    x_internal_key: Annotated[Optional[str], Header()] = None,
) -> None:
    """
    Si INTERNAL_API_KEY est défini dans l'environnement, exige le header
    X-Internal-Key identique. Sinon aucune vérification (rétrocompatible).
    """
    key = get_settings().internal_api_key
    if not key:
        return
    if not x_internal_key or x_internal_key != key:
        raise HTTPException(
            status_code=401,
            detail="X-Internal-Key manquant ou invalide",
        )
