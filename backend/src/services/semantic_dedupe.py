"""Déduplication sémantique (passe 2) — cosinus sur embeddings d’articles (MEMW §3.2)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any, Optional

import numpy as np
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config import get_settings
from src.models.article import Article
from src.models.edition import PipelineDebugLog
logger = structlog.get_logger(__name__)


def _cosine_matrix_rows(X: np.ndarray) -> np.ndarray:
    """Cosinus entre lignes (vecteurs déjà normalisés ou non)."""
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    Xn = X / norms
    return Xn @ Xn.T


async def run_semantic_dedup(
    db: AsyncSession,
    *,
    edition_id: Optional[uuid.UUID] = None,
    threshold: float | None = None,
) -> dict[str, Any]:
    """
    Parmi les articles non syndiqués avec embedding, marque les quasi-doublons
    (cosinus ≥ seuil) en gardant canonical par tier média + date.
    """
    s = get_settings()
    thr = float(threshold if threshold is not None else s.semantic_dedup_cosine)

    stmt = (
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.is_syndicated.is_(False))
        .where(Article.canonical_article_id.is_(None))
        .where(Article.embedding.isnot(None))
    )
    if edition_id is not None:
        stmt = stmt.where(Article.edition_id == edition_id)
    res = await db.execute(stmt)
    articles = list(res.scalars().all())
    if len(articles) < 2:
        return {"pairs": 0, "marked": 0, "articles_in": len(articles)}

    emb = []
    ids: list[uuid.UUID] = []
    for a in articles:
        # Ne pas utiliser `if a.embedding` : pgvector / numpy peut exposer un ndarray
        # (truth value ambiguous). Tester explicitement None puis la longueur.
        raw = a.embedding
        if raw is None:
            continue
        try:
            ln = len(raw)
        except TypeError:
            continue
        if ln != 1024:
            continue
        emb.append(np.array(raw, dtype=np.float64))
        ids.append(a.id)
    if len(ids) < 2:
        return {"pairs": 0, "marked": 0, "articles_in": len(ids)}

    X = np.stack(emb)
    sim = _cosine_matrix_rows(X)
    n = len(ids)
    articles_by_id = {a.id: a for a in articles}

    def score(aid: uuid.UUID) -> tuple[int, float, int]:
        a = articles_by_id[aid]
        tier = int(a.media_source.tier) if a.media_source else 0
        ts = a.published_at.timestamp() if a.published_at else 0.0
        pub_key = -ts
        ln = len((a.summary_fr or "") or "")
        return (tier, pub_key, ln)

    parent: dict[int, int] = {i: i for i in range(n)}

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def uf_union(i: int, j: int) -> None:
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    pairs = 0
    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] >= thr:
                uf_union(i, j)
                pairs += 1

    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    marked = 0
    report: list[dict[str, Any]] = []
    for _root, idxs in groups.items():
        if len(idxs) < 2:
            continue
        memb = [ids[i] for i in idxs]
        canonical = max(memb, key=lambda x: score(x))
        names: list[str] = []
        for mid in memb:
            ms = articles_by_id[mid].media_source
            if ms:
                names.append(ms.name)
        for mid in memb:
            art = articles_by_id[mid]
            if mid == canonical:
                art.syndication_group_size = len(memb)
                art.syndication_group_sources = sorted(set(names))
            else:
                art.is_syndicated = True
                art.canonical_article_id = canonical
                marked += 1
        report.append(
            {
                "canonical": str(canonical),
                "members": [str(m) for m in memb],
                "size": len(memb),
            }
        )

    await db.commit()

    if edition_id and report:
        db.add(
            PipelineDebugLog(
                edition_id=edition_id,
                step="dedup_semantic",
                payload={"groups": report, "threshold": thr},
            )
        )
        await db.commit()

    logger.info(
        "semantic_dedup.done",
        pairs=pairs,
        marked=marked,
        groups=len(report),
    )
    return {"pairs": pairs, "marked": marked, "groups": len(report), "articles_in": n}
