"""
Déduplication légère type SimHash sur résumés FR (reprises d’agence / syndication).
Marque is_syndicated + canonical_article_id (article le plus ancien du groupe).
"""

from __future__ import annotations

import hashlib
import re
import uuid
from collections import defaultdict

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article

logger = structlog.get_logger(__name__)

_SIMHASH_BITS = 64


def simhash_hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def _normalize_body_excerpt(content: str, max_chars: int = 12000) -> str:
    if not content:
        return ""
    t = re.sub(r"\s+", " ", content.strip())
    return t[:max_chars]


def simhash_body_64(content: str) -> int:
    return simhash_64(_normalize_body_excerpt(content))


def _tokens(text: str) -> list[str]:
    return re.findall(r"\w{3,}", text.lower(), flags=re.UNICODE)


def _token_hash_64(word: str) -> int:
    """Hash déterministe sur 64 bits (évite hash() Python non reproductible entre process)."""
    digest = hashlib.md5(word.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") & ((1 << _SIMHASH_BITS) - 1)


def simhash_64(text: str) -> int:
    if not text or len(text.strip()) < 40:
        return 0
    toks = _tokens(text)
    if not toks:
        return 0
    weights: dict[str, int] = defaultdict(int)
    for t in toks:
        weights[t] += 1
    v = [0] * _SIMHASH_BITS
    for word, w in weights.items():
        h = _token_hash_64(word)
        for b in range(_SIMHASH_BITS):
            if h & (1 << b):
                v[b] += w
            else:
                v[b] -= w
    out = 0
    for b in range(_SIMHASH_BITS):
        if v[b] >= 0:
            out |= 1 << b
    return out


async def mark_syndicated_from_summaries(
    db: AsyncSession,
    *,
    min_summary_len: int = 80,
    edition_id: uuid.UUID | None = None,
) -> int:
    """
    Regroupe les articles avec le même SimHash de summary_fr (reprise quasi identique).
    Le plus ancien (published_at puis collected_at) devient canonique.
    """
    stmt = select(Article).where(
        Article.summary_fr.isnot(None),
        Article.is_syndicated.is_(False),
    )
    if edition_id is not None:
        stmt = stmt.where(Article.edition_id == edition_id)
    res = await db.execute(stmt)
    articles = list(res.scalars().all())

    buckets: dict[int, list[Article]] = defaultdict(list)
    for a in articles:
        s = (a.summary_fr or "").strip()
        if len(s) < min_summary_len:
            continue
        h = simhash_64(s)
        if h == 0:
            continue
        buckets[h].append(a)

    marked = 0
    for _h, group in buckets.items():
        if len(group) < 2:
            continue
        group.sort(
            key=lambda x: (x.published_at or x.collected_at, x.collected_at),
        )
        canonical = group[0]
        for other in group[1:]:
            other.is_syndicated = True
            other.canonical_article_id = canonical.id
            marked += 1

    if marked:
        await db.commit()
        logger.info("simhash.syndicated_marked", count=marked)
    return marked


async def mark_syndicated_from_bodies(
    db: AsyncSession,
    *,
    max_hamming: int = 13,
    min_body_len: int = 400,
    edition_id: uuid.UUID | None = None,
) -> int:
    """
    SimHash sur extrait normalisé du corps : regroupe les reprises (~80 % similarité, Hamming).
    """
    from src.config import get_settings

    max_hamming = int(get_settings().body_simhash_max_hamming)

    stmt = select(Article).where(
        Article.content_original.isnot(None),
        Article.is_syndicated.is_(False),
    )
    if edition_id is not None:
        stmt = stmt.where(Article.edition_id == edition_id)
    res = await db.execute(stmt)
    articles = list(res.scalars().all())

    hashes: list[tuple[Article, int]] = []
    for a in articles:
        body = (a.content_original or "").strip()
        if len(body) < min_body_len:
            continue
        h = simhash_body_64(body)
        if h == 0:
            continue
        hashes.append((a, h))

    n = len(hashes)
    if n < 2:
        return 0

    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(n):
        for j in range(i + 1, n):
            if simhash_hamming(hashes[i][1], hashes[j][1]) <= max_hamming:
                union(i, j)

    groups: dict[int, list[Article]] = defaultdict(list)
    for idx in range(n):
        groups[find(idx)].append(hashes[idx][0])

    marked = 0
    for _root, group in groups.items():
        if len(group) < 2:
            continue
        group.sort(
            key=lambda x: (x.published_at or x.collected_at, x.collected_at),
        )
        canonical = group[0]
        for other in group[1:]:
            other.is_syndicated = True
            other.canonical_article_id = canonical.id
            marked += 1

    if marked:
        await db.commit()
        logger.info("simhash.body_syndicated_marked", count=marked, max_hamming=max_hamming)
    return marked
