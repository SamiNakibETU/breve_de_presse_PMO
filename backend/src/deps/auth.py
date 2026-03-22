"""Auth interne optionnelle (Bearer) pour endpoints de mutation."""

from typing import Annotated, Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.config import get_settings

_bearer = HTTPBearer(auto_error=False)


async def require_internal_key(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer)],
) -> None:
    """
    Si INTERNAL_API_KEY est défini, exige le header
    Authorization: Bearer <INTERNAL_API_KEY>. Sinon aucune vérification.
    """
    key = get_settings().internal_api_key
    if not key:
        return
    token = (
        creds.credentials
        if creds is not None and creds.scheme.lower() == "bearer"
        else None
    )
    if not token or token != key:
        raise HTTPException(status_code=401, detail="Unauthorized")
