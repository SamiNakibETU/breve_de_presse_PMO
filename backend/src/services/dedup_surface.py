"""
Déduplication surface — MinHash LSH sur texte FR (MEMW spec §3.2 passe 1).
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any, Optional

import structlog
from datasketch import MinHash, MinHashLSH
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.models.article import Article
from src.models.media_source import MediaSource

logger = structlog.get_logger(__name__)

NUM_PERM = 128
SHINGLE_SIZE = 5
JACCARD_THRESHOLD = 0.65


def _fr_text(a: Article) -> str:
    body = (a.content_translated_fr or a.summary_fr or "") or ""
    title = (a.title_fr or a.title_original or "") or ""
    return f"{title}\n{body}".strip()


def _shingles(text: str) -> list[str]:
    words = text.lower().split()
    if len(words) < SHINGLE_SIZE:
        return [" ".join(words)] if words else []
    return [" ".join(words[i : i + SHINGLE_SIZE]) for i in range(len(words) - SHINGLE_SIZE + 1)]


def _minhash(text: str) -> MinHash:
    m = MinHash(num_perm=NUM_PERM)
    for s in _shingles(text):
        m.update(s.encode("utf-8"))
    return m


def _elect_canonical(
    ids: list[uuid.UUID],
    articles_by_id: dict[uuid.UUID, Article],
) -> uuid.UUID:
    """Tier média le plus élevé, puis parution la plus ancienne, puis texte le plus long."""

    def score(aid: uuid.UUID) -> tuple[int, float, int]:
        a = articles_by_id[aid]
        tier = int(a.media_source.tier) if a.media_source else 0
        ts = a.published_at.timestamp() if a.published_at else 0.0
        pub_key = -ts
        ln = len((a.content_translated_fr or a.summary_fr or "") or "")
        return (tier, pub_key, ln)

    return max(ids, key=lambda x: score(x))


async def run_surface_dedup(
    db: AsyncSession,
    *,
    edition_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    """
    Marque les doublons syndiqués (is_syndicated + canonical_article_id).
    Les représentants reçoivent syndication_group_size / syndication_group_sources.
    """
    stmt = (
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.is_syndicated.is_(False))
        .where(Article.canonical_article_id.is_(None))
    )
    if edition_id is not None:
        stmt = stmt.where(Article.edition_id == edition_id)
    stmt = stmt.where(Article.translation_confidence.isnot(None))
    stmt = stmt.where(Article.translation_confidence >= 0.70)

    res = await db.execute(stmt)
    articles = list(res.scalars().all())
    articles = [a for a in articles if len(_fr_text(a)) >= 80]
    if len(articles) < 2:
        return {"groups": 0, "duplicates_marked": 0, "articles_in": len(articles)}

    lsh = MinHashLSH(threshold=JACCARD_THRESHOLD, num_perm=NUM_PERM)
    id_to_mh: dict[uuid.UUID, MinHash] = {}
    articles_by_id = {a.id: a for a in articles}

    for a in articles:
        t = _fr_text(a)
        mh = _minhash(t)
        id_to_mh[a.id] = mh
        lsh.insert(str(a.id), mh)

    # Regrouper par composantes : pour chaque paire query
    parent: dict[uuid.UUID, uuid.UUID] = {a.id: a.id for a in articles}

    def find(x: uuid.UUID) -> uuid.UUID:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: uuid.UUID, y: uuid.UUID) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    for a in articles:
        mh = id_to_mh[a.id]
        neighbors = lsh.query(mh)
        for n in neighbors:
            if n == str(a.id):
                continue
            try:
                oid = uuid.UUID(n)
                union(a.id, oid)
            except ValueError:
                continue

    groups: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    for a in articles:
        groups[find(a.id)].append(a.id)

    dup_marked = 0
    report_groups: list[dict[str, Any]] = []

    for root, members in groups.items():
        if len(members) < 2:
            continue
        canonical = _elect_canonical(members, articles_by_id)
        names: list[str] = []
        for mid in members:
            ms = articles_by_id[mid].media_source
            if ms:
                names.append(ms.name)
        for mid in members:
            art = articles_by_id[mid]
            if mid == canonical:
                art.syndication_group_size = len(members)
                art.syndication_group_sources = sorted(set(names))
            else:
                art.is_syndicated = True
                art.canonical_article_id = canonical
                dup_marked += 1
        report_groups.append(
            {
                "canonical": str(canonical),
                "members": [str(m) for m in members],
                "size": len(members),
            }
        )

    await db.commit()

    logger.info(
        "dedup_surface.done",
        groups=len(report_groups),
        duplicates_marked=dup_marked,
    )
    return {
        "groups": len(report_groups),
        "duplicates_marked": dup_marked,
        "articles_in": len(articles),
    }
