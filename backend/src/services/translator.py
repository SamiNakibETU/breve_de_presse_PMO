"""
Translation + summarization pipeline using hybrid LLM routing (async).
Combined: translate, summarize, classify, extract entities in one LLM call.

Routing per source language:
  ar/fa/tr/ku → Cerebras (Qwen3 235B)
  en/fr       → Groq (Llama 4 Scout)
  he          → Anthropic (Claude Haiku)
"""

import asyncio
import json
import re
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.media_source import MediaSource
from src.services.entity_service import upsert_entities
from src.services.llm_router import get_llm_router

logger = structlog.get_logger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """Tu es un traducteur-rédacteur professionnel travaillant pour L'Orient-Le Jour, \
quotidien francophone libanais de référence. Ta tâche est de traduire, résumer et analyser \
des articles de presse du Moyen-Orient.

RÈGLES DE TRADUCTION :
1. Traduis fidèlement le sens, pas mot à mot
2. Résumé en 150-200 mots exactement, en français soutenu mais accessible
3. Ton neutre et restitutif — restitue l'argument de l'auteur sans le juger
4. Attribution systématique : "L'auteur estime que...", "Selon le chroniqueur..."
5. Guillemets français « » pour les citations traduites
6. Translittération simplifiée des noms propres arabes (Hassan Nasrallah, pas Ḥasan Naṣrallāh)
7. Présent de narration comme temps principal
8. Structure QQQOCP dans les deux premières phrases (Qui, Quoi, Quand, Où, Comment, Pourquoi)
9. Pas de superlatifs sauf citation directe
10. Le résumé doit être autonome (compréhensible sans lire l'article original)

RÈGLES DE CLASSIFICATION :
- opinion : article d'opinion signé par un auteur externe
- editorial : éditorial signé par la rédaction ou le rédacteur en chef
- tribune : tribune libre d'un expert, politique ou intellectuel
- analysis : analyse factuelle approfondie par un journaliste
- news : article de nouvelles factuel
- interview : entretien avec une personnalité
- reportage : reportage de terrain

Réponds UNIQUEMENT en JSON valide, sans markdown, sans backticks."""


def _build_translate_prompt(article: Article, media_name: str) -> str:
    content = article.content_original or article.title_original
    words = content.split()
    if len(words) > 4000:
        content = " ".join(words[:4000]) + "\n[... article tronqué]"

    return json.dumps(
        {
            "task": "translate_summarize_classify",
            "source_language": article.source_language or "auto",
            "target_language": "fr",
            "article": {
                "title": article.title_original,
                "author": article.author or "Non spécifié",
                "media": media_name,
                "date": (
                    article.published_at.isoformat()
                    if article.published_at
                    else "Date inconnue"
                ),
                "content": content,
            },
            "required_output": {
                "translated_title": "titre traduit en français",
                "thesis_summary": "résumé de la thèse en une phrase courte (max 15 mots)",
                "summary_fr": "résumé de 150-200 mots en français, ton neutre restitutif",
                "key_quotes_fr": ["citation traduite 1", "citation traduite 2"],
                "article_type": "opinion|editorial|tribune|analysis|news|interview|reportage",
                "entities": [
                    {
                        "name": "nom original",
                        "type": "PERSON|ORG|GPE|EVENT",
                        "name_fr": "nom en français",
                    }
                ],
                "confidence_score": 0.95,
                "translation_notes": "difficultés de traduction éventuelles",
            },
        },
        ensure_ascii=False,
    )


def _build_french_prompt(article: Article, media_name: str) -> str:
    content = article.content_original or article.title_original
    words = content.split()
    if len(words) > 4000:
        content = " ".join(words[:4000])

    return json.dumps(
        {
            "task": "summarize_and_classify_french",
            "article": {
                "title": article.title_original,
                "author": article.author or "Non spécifié",
                "media": media_name,
                "content": content,
            },
            "required_output": {
                "thesis_summary": "thèse en une phrase (max 15 mots)",
                "summary_fr": "résumé de 150-200 mots, ton neutre restitutif OLJ",
                "key_quotes_fr": ["citation 1", "citation 2"],
                "article_type": "opinion|editorial|tribune|analysis|news|interview|reportage",
                "entities": [
                    {"name": "nom", "type": "PERSON|ORG|GPE|EVENT", "name_fr": "nom"}
                ],
            },
        },
        ensure_ascii=False,
    )


def _parse_llm_json(text: str) -> dict:
    """Parse JSON from LLM response with fallback regex extraction."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Cannot parse JSON from LLM response: {text[:300]}")


class TranslationPipeline:
    def __init__(self) -> None:
        self._router = get_llm_router()
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(3)

    async def process_pending(self, limit: int = 50) -> dict:
        async with self._factory() as db:
            result = await db.execute(
                select(Article)
                .where(Article.status == "collected")
                .where(Article.content_original.isnot(None))
                .order_by(Article.collected_at.desc())
                .limit(limit)
            )
            articles = result.scalars().all()

        logger.info("translation.start", article_count=len(articles))
        stats: dict = {"processed": 0, "errors": 0, "needs_review": 0}

        tasks = [self._process_one(a, stats) for a in articles]
        await asyncio.gather(*tasks)

        logger.info("translation.complete", **stats)
        return stats

    async def _process_one(self, article: Article, stats: dict) -> None:
        async with self._semaphore:
            try:
                await self._process_article(article)
                stats["processed"] += 1
            except Exception as exc:
                stats["errors"] += 1
                logger.error(
                    "translation.article_error",
                    article_id=str(article.id),
                    error=str(exc),
                )
                async with self._factory() as db:
                    art = await db.get(Article, article.id)
                    if art:
                        art.status = "error"
                        art.processing_error = str(exc)[:500]
                        await db.commit()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _process_article(self, article: Article) -> None:
        async with self._factory() as db:
            source = await db.get(MediaSource, article.media_source_id)
            media_name = source.name if source else "Unknown"

        is_french = article.source_language == "fr"
        lang = article.source_language or "unknown"

        if is_french:
            prompt = _build_french_prompt(article, media_name)
        else:
            prompt = _build_translate_prompt(article, media_name)

        raw_text = await self._router.translate(
            system=SYSTEM_PROMPT,
            prompt=prompt,
            language=lang,
            max_tokens=1500,
        )

        data = _parse_llm_json(raw_text)

        confidence = float(data.get("confidence_score", 1.0 if is_french else 0.0))
        if confidence < settings.translation_confidence_threshold:
            status = "needs_review"
        else:
            status = "translated"

        async with self._factory() as db:
            art = await db.get(Article, article.id)
            if not art:
                return

            if is_french:
                art.title_fr = article.title_original
            else:
                art.title_fr = data.get("translated_title", "")

            art.thesis_summary_fr = data.get("thesis_summary", "")
            art.summary_fr = data.get("summary_fr", "")
            art.key_quotes_fr = data.get("key_quotes_fr", [])
            art.article_type = data.get("article_type", "other")
            art.translation_confidence = confidence
            art.translation_notes = data.get("translation_notes", "")
            art.status = status
            art.processed_at = datetime.now(timezone.utc)

            entities_raw = data.get("entities", [])
            if entities_raw:
                await upsert_entities(db, article.id, entities_raw)

            await db.commit()

        logger.info(
            "translation.done",
            article_id=str(article.id),
            status=status,
            confidence=confidence,
        )


async def run_translation_pipeline(limit: int = 50) -> dict:
    pipeline = TranslationPipeline()
    return await pipeline.process_pending(limit=limit)
