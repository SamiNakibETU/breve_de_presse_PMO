"""
Détection des développements du jour (2 passes LLM) — MEMW v2.
Remplace le regroupement HDBSCAN pour la navigation « sujets » côté journaliste.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import defaultdict
from typing import Any, Optional

import structlog
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.article import Article
from src.models.edition import Edition, EditionTopic, EditionTopicArticle
from src.models.media_source import MediaSource
from src.config import get_settings
from src.services.country_utils import COVERAGE_TARGET_COUNTRIES
from src.services.cost_estimate import estimate_llm_usage
from src.services.edition_schedule import sql_article_belongs_to_edition_corpus
from src.services.llm_route_hint import hint_anthropic_generation, hint_olj_generation_primary
from src.services.llm_router import get_llm_router
from src.services.olj_pipeline_llm import olj_pipeline_completion
from src.services.provider_usage_ledger import append_provider_usage_commit
from src.services.alerts import post_topic_detector_low_articles_alert

logger = structlog.get_logger(__name__)

TOPIC_DETECTOR_ARTICLE_LIMIT = 80
CLASSIFY_BATCH_SIZE = 18
EDITORIAL_TYPES = ("opinion", "editorial", "tribune", "analysis")

PASS1_SYSTEM = """Tu es rédacteur en chef à L'Orient-Le Jour. Tu prépares la revue de presse \
régionale quotidienne. Son objectif : montrer aux lecteurs comment les médias \
de la région REGARDENT les développements en cours.

La valeur éditoriale est dans le CONTRASTE DES PERSPECTIVES : sur un même fait, \
un éditorialiste saoudien et un éditorialiste iranien ne disent pas la même chose. \
C'est ce contraste que tu cherches."""

PASS1_USER_TEMPLATE = """Voici les {n} articles d'opinion les plus pertinents du jour \
(titre FR, thèse, pays du média ISO2, nom du média) :

{articles_block}

Pays prioritaires pour la diversité de la revue (codes ISO2) : {coverage_targets}

Identifie les 5-8 DÉVELOPPEMENTS FACTUELS qui génèrent le plus de regards \
régionaux contrastés dans ce corpus.

Règles :
1. Un développement = un fait ou une situation sur lequel des médias de \
   PLUSIEURS PAYS réagissent avec des perspectives différentes
2. PRIORITÉ ABSOLUE aux développements couverts par 3+ pays — c'est là que \
   le contraste est riche et que la revue a de la valeur
3. Un développement couvert par 1 seul pays est acceptable UNIQUEMENT si \
   c'est un regard interne fort (ex: presse israélienne sur la Knesset)
4. Label FACTUEL et SPÉCIFIQUE :
   BON : "Frappes iraniennes sur les pays du Golfe"
   MAUVAIS : "Tensions régionales", "Crise au Moyen-Orient"
5. description : UNE phrase de contexte factuel
6. Maximum 15 articles par développement. Si un développement attire 20+ \
   articles, le subdiviser (ex: séparer "réactions arabes" de "réponse américaine")
7. Les articles sur la spiritualité, la culture, le sport sans dimension \
   géopolitique vont dans un bucket "hors_sujet" — ne pas créer de \
   développement pour eux

Réponds UNIQUEMENT en JSON (pas de markdown) :
{{
  "developments": [
    {{
      "id": "slug-unique-kebab",
      "label": "Titre factuel du développement",
      "description": "Une phrase de contexte factuel.",
      "countries_expected": ["SA", "KW"],
      "priority": 1,
      "is_multi_perspective": true
    }}
  ]
}}"""


PASS2_SYSTEM = """Tu es rédacteur en chef à L'Orient-Le Jour. Tu classes des articles \
d'opinion dans des développements factuels du jour. Réponds uniquement en JSON valide."""

PASS2_USER_TEMPLATE = """Voici les développements du jour :
{developments_json}

Classe chacun de ces articles dans UN développement (identifiant id) ou \
"hors_sujet" si vraiment aucun ne convient :

{articles_batch}

Pour chaque article, indique aussi :
- perspective_rarity : entier 1-5 (5 = ce pays est le seul à couvrir ce \
  développement dans le corpus fourni, 1 = perspective commune à beaucoup de médias). \
  La revue de presse valorise les regards RARES.

Réponds UNIQUEMENT par un tableau JSON :
[{{"article_id": "uuid", "development_id": "slug-ou-hors_sujet", "fit_confidence": 0.85, "perspective_rarity": 4}}]"""


def _article_rel_score(article: Article) -> float:
    if article.relevance_score is not None:
        return float(article.relevance_score)
    if article.relevance_score_deterministic is not None:
        return float(article.relevance_score_deterministic)
    return 0.0


def _parse_json_loose(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


def _build_articles_block(rows: list[tuple[Article, MediaSource]]) -> str:
    lines: list[str] = []
    for art, src in rows:
        tid = str(art.id)
        title = (art.title_fr or art.title_original or "")[:200]
        thesis = (art.thesis_summary_fr or "")[:400]
        cc = (src.country_code or "XX").upper()
        media = src.name or ""
        lines.append(
            f"- id={tid} | titre={title!r} | these={thesis!r} | pays={cc} | media={media!r}",
        )
    return "\n".join(lines)


def _compute_display_order(
    items: list[tuple[Article, str, int, float]],
) -> dict[uuid.UUID, int]:
    """
    items: (article, country_code, perspective_rarity, relevance_score)
    Un représentant par pays (meilleur score), triés par rareté DESC, puis le reste par score.
    """
    by_cc: dict[str, list[tuple[Article, int, float]]] = defaultdict(list)
    for art, cc, pr, rel in items:
        code = (cc or "XX").upper()
        by_cc[code].append((art, pr, rel))

    reps: list[tuple[uuid.UUID, int, float]] = []
    for _cc, group in by_cc.items():
        best_art, best_pr, best_rel = max(group, key=lambda x: x[2])
        reps.append((best_art.id, best_pr, best_rel))

    reps.sort(key=lambda x: (-x[1], -x[2]))
    ordered: list[uuid.UUID] = [r[0] for r in reps]
    seen = set(ordered)
    remaining: list[tuple[uuid.UUID, float]] = []
    for art, _cc, _pr, rel in items:
        if art.id not in seen:
            remaining.append((art.id, rel))
    remaining.sort(key=lambda x: -x[1])
    ordered.extend(aid for aid, _ in remaining)
    return {aid: idx for idx, aid in enumerate(ordered)}


class TopicDetector:
    """Détecte les développements du jour en 2 passes LLM."""

    async def detect_developments(
        self,
        articles_block: str,
        n: int,
        *,
        edition_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        router = get_llm_router()
        user = PASS1_USER_TEMPLATE.format(
            n=n,
            articles_block=articles_block,
            coverage_targets=", ".join(COVERAGE_TARGET_COUNTRIES),
        )
        last_err: BaseException | None = None
        for attempt in range(3):
            try:
                t0 = time.perf_counter()
                raw = await olj_pipeline_completion(
                    router,
                    PASS1_SYSTEM,
                    user,
                    max_tokens=8192,
                    temperature=0.3,
                )
                dur_ms = int((time.perf_counter() - t0) * 1000)
                prov, mod = (
                    hint_anthropic_generation()
                    if get_settings().olj_generation_anthropic_only
                    else hint_olj_generation_primary()
                )
                inp_t, out_t, cst = estimate_llm_usage(
                    provider=prov,
                    model=mod,
                    input_text=PASS1_SYSTEM + user,
                    output_text=raw or "",
                )
                await append_provider_usage_commit(
                    kind="llm_completion",
                    provider=prov,
                    model=mod,
                    operation="topic_detect_pass1",
                    status="ok",
                    input_units=inp_t,
                    output_units=out_t,
                    cost_usd_est=cst,
                    duration_ms=dur_ms,
                    edition_id=edition_id,
                    meta_json={"attempt": attempt + 1},
                )
                data = _parse_json_loose(raw)
                devs = data.get("developments")
                if not isinstance(devs, list):
                    raise ValueError(
                        "Réponse passe 1 : developments manquant ou invalide",
                    )
                out: list[dict[str, Any]] = []
                for d in devs:
                    if not isinstance(d, dict):
                        continue
                    did = str(d.get("id", "")).strip()
                    if not did:
                        continue
                    out.append(
                        {
                            "id": did[:100],
                            "label": str(d.get("label", ""))[:500],
                            "description": str(d.get("description", ""))[:5000],
                            "countries_expected": d.get("countries_expected")
                            if isinstance(d.get("countries_expected"), list)
                            else [],
                            "priority": int(d.get("priority", 99)),
                            "is_multi_perspective": bool(
                                d.get("is_multi_perspective", True),
                            ),
                        },
                    )
                if not out:
                    raise ValueError("Aucun développement valide après passe 1")
                out.sort(key=lambda x: x["priority"])
                return out[:8]
            except (json.JSONDecodeError, ValueError) as exc:
                last_err = exc
                logger.warning(
                    "topic_detector.pass1_retry",
                    attempt=attempt + 1,
                    error=str(exc)[:200],
                )
                if attempt < 2:
                    await asyncio.sleep(min(30, 2 ** (attempt + 1)))
        assert last_err is not None
        raise last_err

    async def classify_batch(
        self,
        developments: list[dict[str, Any]],
        batch_rows: list[tuple[Article, MediaSource]],
        *,
        edition_id: uuid.UUID | None = None,
    ) -> list[dict[str, Any]]:
        router = get_llm_router()
        dev_json = json.dumps(
            [{"id": d["id"], "label": d["label"]} for d in developments],
            ensure_ascii=False,
        )
        ablock_lines = []
        for art, src in batch_rows:
            ablock_lines.append(
                f"- article_id={art.id} | titre={(art.title_fr or art.title_original)[:180]!r} | "
                f"these={(art.thesis_summary_fr or '')[:300]!r} | pays={(src.country_code or 'XX').upper()}",
            )
        user = PASS2_USER_TEMPLATE.format(
            developments_json=dev_json,
            articles_batch="\n".join(ablock_lines),
        )
        last_err: BaseException | None = None
        for attempt in range(3):
            try:
                t0 = time.perf_counter()
                raw = await olj_pipeline_completion(
                    router,
                    PASS2_SYSTEM,
                    user,
                    max_tokens=4096,
                    temperature=0.2,
                )
                dur_ms = int((time.perf_counter() - t0) * 1000)
                prov, mod = (
                    hint_anthropic_generation()
                    if get_settings().olj_generation_anthropic_only
                    else hint_olj_generation_primary()
                )
                inp_t, out_t, cst = estimate_llm_usage(
                    provider=prov,
                    model=mod,
                    input_text=PASS2_SYSTEM + user,
                    output_text=raw or "",
                )
                await append_provider_usage_commit(
                    kind="llm_completion",
                    provider=prov,
                    model=mod,
                    operation="topic_detect_pass2",
                    status="ok",
                    input_units=inp_t,
                    output_units=out_t,
                    cost_usd_est=cst,
                    duration_ms=dur_ms,
                    edition_id=edition_id,
                    meta_json={
                        "attempt": attempt + 1,
                        "batch_articles": len(batch_rows),
                    },
                )
                data = _parse_json_loose(raw)
                if not isinstance(data, list):
                    raise ValueError("Réponse passe 2 : tableau attendu")
                return data
            except (json.JSONDecodeError, ValueError) as exc:
                last_err = exc
                logger.warning(
                    "topic_detector.pass2_retry",
                    attempt=attempt + 1,
                    error=str(exc)[:200],
                )
                if attempt < 2:
                    await asyncio.sleep(min(30, 2 ** (attempt + 1)))
        assert last_err is not None
        raise last_err

    async def build_edition_topics(self, db: AsyncSession, edition: Edition) -> int:
        eid = edition.id
        try:
            edition.detection_status = "running"
            await db.commit()
            await db.refresh(edition)

            await db.execute(delete(EditionTopic).where(EditionTopic.edition_id == eid))
            await db.flush()

            stmt = (
                select(Article, MediaSource)
                .join(MediaSource, Article.media_source_id == MediaSource.id)
                .where(
                    sql_article_belongs_to_edition_corpus(edition),
                    Article.status.in_(("translated", "formatted", "needs_review")),
                    Article.article_type.in_(EDITORIAL_TYPES),
                    Article.is_syndicated.is_(False),
                )
                .order_by(
                    func.coalesce(
                        Article.relevance_score,
                        Article.relevance_score_deterministic,
                    ).desc().nullslast(),
                )
                .limit(TOPIC_DETECTOR_ARTICLE_LIMIT)
            )
            res = await db.execute(stmt)
            rows = list(res.all())
            logger.info(
                "topic_detector.editorial_candidates",
                edition_id=str(eid),
                count=len(rows),
                min_required=5,
                types=list(EDITORIAL_TYPES),
            )
            if len(rows) < 5:
                logger.warning(
                    "topic_detector.too_few_articles",
                    edition_id=str(eid),
                    count=len(rows),
                    hint="Seuls opinion/editorial/tribune/analysis traduits rattachés à l’édition (edition_id / fenêtre) comptent.",
                )
                try:
                    await post_topic_detector_low_articles_alert(
                        edition_id=str(eid),
                        count=len(rows),
                        min_required=5,
                    )
                except Exception as alert_exc:
                    logger.warning(
                        "topic_detector.low_articles_alert_failed",
                        error=str(alert_exc)[:120],
                    )
                edition.detection_status = "done"
                await db.commit()
                return 0

            articles_block = _build_articles_block(rows)
            developments = await self.detect_developments(
                articles_block,
                len(rows),
                edition_id=eid,
            )

            art_by_id: dict[uuid.UUID, tuple[Article, MediaSource]] = {
                a.id: (a, s) for a, s in rows
            }

            all_classifications: list[dict[str, Any]] = []
            for i in range(0, len(rows), CLASSIFY_BATCH_SIZE):
                batch = rows[i : i + CLASSIFY_BATCH_SIZE]
                part = await self.classify_batch(developments, batch, edition_id=eid)
                all_classifications.extend(part)

            by_dev: dict[str, list[tuple[Article, MediaSource, float, int]]] = defaultdict(
                list,
            )
            hors = 0
            valid_dev_ids = {d["id"] for d in developments}
            for item in all_classifications:
                if not isinstance(item, dict):
                    continue
                aid_raw = item.get("article_id")
                try:
                    aid = uuid.UUID(str(aid_raw).strip())
                except (ValueError, TypeError):
                    continue
                if aid not in art_by_id:
                    continue
                dev_id = str(item.get("development_id", "hors_sujet")).strip()
                if dev_id == "hors_sujet" or dev_id not in valid_dev_ids:
                    hors += 1
                    continue
                try:
                    fc = float(item.get("fit_confidence", 0.5))
                except (TypeError, ValueError):
                    fc = 0.5
                fc = max(0.0, min(1.0, fc))
                try:
                    pr = int(item.get("perspective_rarity", 3))
                except (TypeError, ValueError):
                    pr = 3
                pr = max(1, min(5, pr))
                a, s = art_by_id[aid]
                by_dev[dev_id].append((a, s, fc, pr))

            total_assigned = sum(len(v) for v in by_dev.values())
            classified = total_assigned + hors
            if classified > 0 and hors / classified > 0.30:
                logger.warning(
                    "topic_detector.high_hors_sujet_ratio",
                    edition_id=str(eid),
                    hors=hors,
                    assigned=total_assigned,
                )

            topics_created = 0
            for dev in sorted(developments, key=lambda x: x["priority"]):
                did = dev["id"]
                bucket = by_dev.get(did, [])
                if not bucket:
                    continue

                items_for_order: list[tuple[Article, str, int, float]] = []
                for a, s, fc, pr in bucket:
                    rel = _article_rel_score(a)
                    items_for_order.append(
                        (a, s.country_code or "XX", pr, rel),
                    )
                order_map = _compute_display_order(items_for_order)

                ce = dev.get("countries_expected") or []
                codes = [str(c).upper()[:10] for c in ce if str(c).strip()][:24]

                topic = EditionTopic(
                    edition_id=eid,
                    rank=dev["priority"],
                    title_proposed=dev["label"] or did,
                    status="proposed",
                    angle_id=did,
                    development_description=dev.get("description"),
                    is_multi_perspective=dev["is_multi_perspective"],
                    countries=codes if codes else None,
                    dominant_angle=dev["label"][:2000] if dev.get("label") else None,
                )
                db.add(topic)
                await db.flush()

                by_country_best: dict[str, tuple[float, uuid.UUID]] = {}
                for a, s, fc, pr in bucket:
                    cc = (s.country_code or "XX").upper()
                    prev = by_country_best.get(cc)
                    rel = _article_rel_score(a)
                    if prev is None or rel > prev[0]:
                        by_country_best[cc] = (rel, a.id)

                recommended_ids = {t[1] for t in by_country_best.values()}

                for a, s, fc, pr in bucket:
                    link = EditionTopicArticle(
                        edition_topic_id=topic.id,
                        article_id=a.id,
                        is_recommended=a.id in recommended_ids,
                        is_selected=False,
                        rank_in_topic=order_map.get(a.id),
                        fit_confidence=fc,
                        perspective_rarity=pr,
                        display_order=order_map.get(a.id),
                    )
                    db.add(link)

                topics_created += 1

            if topics_created == 0 and len(developments) > 0:
                logger.warning(
                    "topic_detector.zero_topics_after_llm",
                    edition_id=str(eid),
                    developments=len(developments),
                    hors_sujet_assignments=hors,
                    articles_classified=classified,
                    hint="Passe 2 a tout mis hors_sujet ou les seaux ne recoupent pas les id des développements.",
                )

            edition.detection_status = "done"
            await db.commit()
            logger.info(
                "topic_detector.done",
                edition_id=str(eid),
                topics=topics_created,
            )
            return topics_created

        except Exception as exc:
            logger.exception("topic_detector.failed", edition_id=str(eid), error=str(exc))
            try:
                edition = await db.get(Edition, eid)
                if edition:
                    edition.detection_status = "failed"
                    await db.commit()
            except Exception:
                await db.rollback()
            return 0


async def run_topic_detection_for_edition_id(
    db: AsyncSession,
    edition_id: uuid.UUID,
) -> int:
    """Utilisé par la route POST detect-topics."""
    edition = await db.get(Edition, edition_id)
    if not edition:
        return 0
    detector = TopicDetector()
    return await detector.build_edition_topics(db, edition)
