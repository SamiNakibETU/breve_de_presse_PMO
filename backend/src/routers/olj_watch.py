"""Recherche sémantique, sauvegardes de veille, évaluations traduction (roadmap OLJ)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.database import get_db
from src.deps.auth import require_internal_key
from src.models.article import Article
from src.models.saved_search import SavedSearch
from src.models.translation_review import TranslationReview
from src.schemas.olj_watch import (
    SavedSearchCreate,
    SavedSearchResponse,
    SemanticSearchHit,
    SemanticSearchRequest,
    SemanticSearchResponse,
    TranslationReviewCreate,
    TranslationReviewResponse,
)
from src.services.embedding_service import EmbeddingService
from src.services.olj_taxonomy import validate_olj_topic_ids

router = APIRouter(prefix="/api", tags=["olj-watch"])


def _pg_vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(str(float(x)) for x in vec) + "]"


_RRF_K = 60  # constante RRF standard (Cormack et al. 2009)


def _common_where(
    params: dict,
    body: "SemanticSearchRequest",
    cutoff: "datetime",
    extra_clauses: list[str] | None = None,
) -> list[str]:
    """Clauses WHERE partagées entre vecteur et FTS."""
    clauses: list[str] = ["a.collected_at >= :cutoff"]
    params["cutoff"] = cutoff
    if extra_clauses:
        clauses.extend(extra_clauses)
    if body.country_codes:
        codes = [c.strip().upper() for c in body.country_codes if c.strip()]
        if codes:
            clauses.append("m.country_code = ANY(:ccodes)")
            params["ccodes"] = codes
    if body.article_types:
        clauses.append("a.article_type = ANY(:atypes)")
        params["atypes"] = body.article_types
    return clauses


async def _run_fts(
    db: "AsyncSession",
    body: "SemanticSearchRequest",
    cutoff: "datetime",
    fetch_lim: int,
) -> list[tuple]:
    """Recherche plein-texte PostgreSQL (dictionnaire 'simple' → pas de stemming → noms propres OK).

    Champs indexés : title_fr · summary_fr · editorial_angle · author_thesis_explicit_fr
    Retourne des lignes (id, ts_rank, title_fr, url, olj_topic_ids).
    """
    fts_params: dict = {"fts_lim": fetch_lim, "query_text": body.query}
    fts_col = (
        "coalesce(a.title_fr,'') || ' ' || coalesce(a.summary_fr,'') || ' ' "
        "|| coalesce(a.editorial_angle,'') || ' ' || coalesce(a.author_thesis_explicit_fr,'')"
    )
    clauses = _common_where(fts_params, body, cutoff)
    clauses.append(
        f"to_tsvector('simple', {fts_col}) @@ plainto_tsquery('simple', :query_text)"
    )
    sql = f"""
    SELECT a.id,
           ts_rank(to_tsvector('simple', {fts_col}),
                   plainto_tsquery('simple', :query_text)) AS rank,
           a.title_fr,
           a.url,
           a.olj_topic_ids
    FROM articles a
    JOIN media_sources m ON m.id = a.media_source_id
    WHERE {" AND ".join(clauses)}
    ORDER BY rank DESC
    LIMIT :fts_lim
    """
    result = await db.execute(text(sql), fts_params)
    return list(result.all())


@router.post("/articles/search/semantic", response_model=SemanticSearchResponse)
async def semantic_search(
    body: SemanticSearchRequest,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    settings = get_settings()
    is_pg = db.get_bind() is not None and "postgresql" in str(db.get_bind().url).lower()
    if not is_pg:
        raise HTTPException(
            501,
            detail="Recherche disponible uniquement avec PostgreSQL",
        )

    cutoff = datetime.now(timezone.utc) - timedelta(hours=body.hours)
    topic_filter = validate_olj_topic_ids(body.topic_ids or [], max_topics=20)
    want_topics = set(topic_filter)

    # ── 1. Recherche FTS (toujours disponible, indépendante de Cohere) ───
    fts_fetch_lim = min(body.limit * 6, 300)
    try:
        fts_rows = await _run_fts(db, body, cutoff, fts_fetch_lim)
    except Exception as exc:
        raise HTTPException(500, detail=f"Recherche texte: {exc!s}") from exc

    # ── 2. Recherche vectorielle (optionnelle selon disponibilité Cohere) ─
    vec_rows: list[tuple] = []
    vec_ok = False
    if settings.cohere_api_key:
        try:
            service = EmbeddingService()
            qvec = await service.embed_query(body.query)
            lit = _pg_vector_literal(qvec)
            vec_params: dict = {"qvec": lit}
            vec_fetch_lim = min(body.limit * 6, 300)
            vec_clauses = _common_where(vec_params, body, cutoff, ["a.embedding IS NOT NULL"])
            vec_sql = f"""
            SELECT a.id,
                   (a.embedding <=> CAST(:qvec AS vector)) AS dist,
                   a.title_fr,
                   a.url,
                   a.olj_topic_ids
            FROM articles a
            JOIN media_sources m ON m.id = a.media_source_id
            WHERE {" AND ".join(vec_clauses)}
            ORDER BY a.embedding <=> CAST(:qvec AS vector)
            LIMIT :vec_lim
            """
            vec_params["vec_lim"] = vec_fetch_lim
            result = await db.execute(text(vec_sql), vec_params)
            vec_rows = list(result.all())
            vec_ok = True
        except Exception:
            vec_ok = False  # FTS seul si embedding échoue

    # ── 3. Fusion RRF ────────────────────────────────────────────────────
    # rank_vec[id] = 1-based rank dans la liste vecteur (None → absent)
    rank_vec: dict[str, int] = {str(r[0]): i + 1 for i, r in enumerate(vec_rows)}
    rank_fts: dict[str, int] = {str(r[0]): i + 1 for i, r in enumerate(fts_rows)}

    # Tous les ids candidats (union des deux listes, filtrés par topic si besoin)
    all_ids: list[str] = list(dict.fromkeys(list(rank_vec) + list(rank_fts)))

    # Index olj_topic_ids et métadonnées depuis les deux sources
    meta: dict[str, tuple] = {}  # id → (title_fr, url, topic_ids)
    for r in vec_rows:
        meta[str(r[0])] = (r[2], r[3], r[4])
    for r in fts_rows:
        if str(r[0]) not in meta:
            meta[str(r[0])] = (r[2], r[3], r[4])

    # Filtre topic
    if want_topics:
        all_ids = [
            aid for aid in all_ids
            if isinstance(meta.get(aid, (None, None, None))[2], list)
            and set(meta[aid][2]) & want_topics
        ]

    # Score RRF : 1/(k+rank_v) + 1/(k+rank_t) — 0 si absent d'un côté
    BIG = 10_000
    def rrf(aid: str) -> float:
        rv = rank_vec.get(aid, BIG)
        rt = rank_fts.get(aid, BIG)
        return 1.0 / (_RRF_K + rv) + 1.0 / (_RRF_K + rt)

    all_ids.sort(key=rrf, reverse=True)

    # ── 4. Construire la réponse ─────────────────────────────────────────
    hits: list[SemanticSearchHit] = []
    fts_count = 0
    vector_count = 0
    for aid in all_ids:
        if len(hits) >= body.limit:
            break
        in_vec = aid in rank_vec
        in_fts = aid in rank_fts
        if in_vec and in_fts:
            source = "hybrid"
            vector_count += 1
            fts_count += 1
        elif in_vec:
            source = "vector"
            vector_count += 1
        else:
            source = "text"
            fts_count += 1

        title_fr, url, _ = meta[aid]
        # distance: cosine si disponible, sinon 0 (FTS-only)
        dist = 0.0
        if in_vec:
            rv = rank_vec[aid]
            # récupérer la distance réelle depuis vec_rows
            dist = float(vec_rows[rv - 1][1])

        hits.append(
            SemanticSearchHit(
                article_id=aid,
                distance=dist,
                title_fr=title_fr,
                url=url,
                match_source=source,
                rrf_score=rrf(aid),
            )
        )

    return SemanticSearchResponse(
        hits=hits,
        query=body.query,
        fts_count=fts_count,
        vector_count=vector_count,
    )


@router.post("/saved-searches", response_model=SavedSearchResponse)
async def create_saved_search(
    body: SavedSearchCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    row = SavedSearch(
        query_text=body.query_text.strip(),
        filters_json=body.filters_json,
        owner=body.owner,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return SavedSearchResponse(
        id=str(row.id),
        query_text=row.query_text,
        filters_json=row.filters_json,
        owner=row.owner,
        created_at=row.created_at,
    )


@router.get("/saved-searches", response_model=list[SavedSearchResponse])
async def list_saved_searches(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    res = await db.execute(
        select(SavedSearch).order_by(SavedSearch.created_at.desc()).limit(limit)
    )
    rows = res.scalars().all()
    return [
        SavedSearchResponse(
            id=str(r.id),
            query_text=r.query_text,
            filters_json=r.filters_json,
            owner=r.owner,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/translation-reviews", response_model=TranslationReviewResponse)
async def create_translation_review(
    body: TranslationReviewCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_internal_key),
):
    try:
        aid = uuid.UUID(body.article_id.strip())
    except ValueError as exc:
        raise HTTPException(400, detail="article_id UUID invalide") from exc
    art = await db.get(Article, aid)
    if not art:
        raise HTTPException(404, detail="Article introuvable")
    row = TranslationReview(
        article_id=aid,
        rating=body.rating,
        reviewer=body.reviewer,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return TranslationReviewResponse(
        id=str(row.id),
        article_id=str(row.article_id),
        rating=row.rating,
        reviewer=row.reviewer,
        notes=row.notes,
        created_at=row.created_at,
    )
