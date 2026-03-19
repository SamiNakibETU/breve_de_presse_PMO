"""
Translation + summarization pipeline using hybrid LLM routing (async).
Combined: translate, summarize (Chain of Density), classify, extract entities.

Chain of Density: the LLM progressively compresses the summary to maximize
information density within 150-200 words, following Adams et al. (2023).

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

MÉTHODE DE RÉSUMÉ — Chain of Density :
Tu dois produire un résumé DENSE et INFORMATIF de 150-200 mots. Pour cela, suis ce processus mental :
1. Identifie les 5-7 entités et faits les plus importants de l'article
2. Rédige un premier résumé qui les contient tous
3. Compresse mentalement : élimine toute redondance, fusionne les phrases quand c'est possible
4. Le résumé final doit être AUTONOME (compréhensible sans l'article) et DENSE (chaque phrase apporte une info nouvelle)

RÈGLES DE TRADUCTION :
1. Traduis fidèlement le sens, pas mot à mot
2. Résumé de 150-200 mots EXACTEMENT — français soutenu mais accessible
3. Ton neutre et restitutif — restitue l'argument de l'auteur sans le juger
4. Attribution systématique : "L'auteur estime que...", "Selon le chroniqueur..."
5. Guillemets français « » pour les citations traduites
6. Translittération simplifiée des noms propres arabes
7. Présent de narration comme temps principal
8. Structure QQQOCP dans les deux premières phrases (Qui, Quoi, Quand, Où, Comment, Pourquoi)
9. Pas de superlatifs sauf citation directe
10. TOUT le texte en français — traduire toutes les citations

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
                "thesis_summary": "thèse de l'auteur en UNE PHRASE assertive percutante (max 20 mots), comme si l'auteur la prononçait",
                "summary_fr": "résumé DENSE de 150-200 mots (Chain of Density : chaque phrase apporte une info nouvelle, zéro redondance)",
                "key_quotes_fr": [
                    "citation traduite en français 1",
                    "citation traduite en français 2",
                ],
                "article_type": "opinion|editorial|tribune|analysis|news|interview|reportage",
                "entities": [
                    {
                        "name": "nom original",
                        "type": "PERSON|ORG|GPE|EVENT",
                        "name_fr": "nom en français",
                    }
                ],
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
                "thesis_summary": "thèse de l'auteur en UNE PHRASE assertive percutante",
                "summary_fr": "résumé DENSE de 150-200 mots (Chain of Density : maximise la densité d'information, zéro redondance)",
                "key_quotes_fr": ["citation 1", "citation 2"],
                "article_type": "opinion|editorial|tribune|analysis|news|interview|reportage",
                "entities": [
                    {"name": "nom", "type": "PERSON|ORG|GPE|EVENT", "name_fr": "nom"}
                ],
            },
        },
        ensure_ascii=False,
    )


def _repair_json(text: str) -> str:
    """Best-effort repair of common LLM JSON mistakes."""
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)
    text = text.replace("\n", " ")
    text = re.sub(r'(?<!\\)"(?=\w)', '"', text)
    return text


def _parse_llm_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        text = text.strip()

    for candidate in [text, _repair_json(text)]:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        raw = match.group()
        for candidate in [raw, _repair_json(raw)]:
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                pass

    raise ValueError(f"Cannot parse JSON from LLM response: {text[:300]}")


def compute_confidence(
    article: Article,
    data: dict,
    is_french: bool,
    used_rss_fallback: bool,
) -> float:
    """Compute a real confidence score from quality signals, not LLM self-report."""
    score = 1.0

    content = article.content_original or ""
    word_count = len(content.split())
    if word_count < 100:
        score -= 0.3
    elif word_count < 300:
        score -= 0.15

    if used_rss_fallback:
        score -= 0.2

    summary = data.get("summary_fr", "")
    summary_wc = len(summary.split())
    if summary_wc < 80:
        score -= 0.3
    elif summary_wc < 140:
        score -= 0.1
    elif summary_wc > 250:
        score -= 0.1

    if not data.get("thesis_summary"):
        score -= 0.1

    quotes = data.get("key_quotes_fr", [])
    if not quotes or len(quotes) == 0:
        score -= 0.05

    entities = data.get("entities", [])
    if not entities or len(entities) == 0:
        score -= 0.05

    if is_french:
        score = min(score + 0.05, 1.0)

    lang = article.source_language or ""
    if lang in ("he", "fa", "ku"):
        score -= 0.05

    return round(max(0.0, min(1.0, score)), 2)


class TranslationPipeline:
    def __init__(self) -> None:
        self._router = get_llm_router()
        self._factory = get_session_factory()
        self._semaphore = asyncio.Semaphore(2)

    async def process_pending(self, limit: int = 300) -> dict:
        async with self._factory() as db:
            result = await db.execute(
                select(Article)
                .where(Article.status.in_(["collected", "error"]))
                .where(Article.content_original.isnot(None))
                .order_by(Article.collected_at.desc())
                .limit(limit)
            )
            articles = result.scalars().all()

        skipped = 0
        to_process = []
        for a in articles:
            content = a.content_original or ""
            if len(content.split()) < 30 and len((a.title_original or "").split()) < 5:
                skipped += 1
                continue
            to_process.append(a)

        logger.info("translation.start", article_count=len(to_process), skipped=skipped)
        stats: dict = {"processed": 0, "errors": 0, "needs_review": 0, "skipped": skipped}

        tasks = [self._process_one(a, stats) for a in to_process]
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
                    error=str(exc)[:200],
                )
                async with self._factory() as db:
                    art = await db.get(Article, article.id)
                    if art:
                        art.status = "error"
                        art.processing_error = str(exc)[:500]
                        await db.commit()
            finally:
                await asyncio.sleep(0.5)

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

        content = article.content_original or ""
        used_rss_fallback = len(content.split()) < 300

        confidence = compute_confidence(article, data, is_french, used_rss_fallback)

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
            await db.commit()

        entities_raw = data.get("entities", [])
        if entities_raw:
            try:
                async with self._factory() as db:
                    await upsert_entities(db, article.id, entities_raw)
                    await db.commit()
            except Exception as ent_exc:
                logger.warning(
                    "translation.entity_upsert_failed",
                    article_id=str(article.id),
                    error=str(ent_exc),
                )

        logger.info(
            "translation.done",
            article_id=str(article.id),
            status=status,
            confidence=confidence,
        )


async def run_translation_pipeline(limit: int = 300) -> dict:
    pipeline = TranslationPipeline()
    return await pipeline.process_pending(limit=limit)
