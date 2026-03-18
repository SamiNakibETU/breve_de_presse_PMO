"""
OLJ Press Review — Translator & Summarizer
Translates and summarizes articles using Claude Haiku 4.5.
Combined pipeline: translate + summarize + classify + extract entities in one call.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import get_settings
from src.models.database import Article, get_session_factory

logger = logging.getLogger(__name__)
settings = get_settings()

SYSTEM_PROMPT = """Tu es un traducteur-rédacteur professionnel travaillant pour L'Orient-Le Jour, 
quotidien francophone libanais de référence. Ta tâche est de traduire, résumer et analyser 
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


def _build_user_prompt(article: Article, media_name: str) -> str:
    """Build the user prompt for translation + summarization."""
    content = article.content_original or article.title_original
    # Truncate very long articles to ~4000 words to control costs
    words = content.split()
    if len(words) > 4000:
        content = " ".join(words[:4000]) + "\n[... article tronqué]"

    return json.dumps({
        "task": "translate_summarize_classify",
        "source_language": article.source_language or "auto",
        "target_language": "fr",
        "article": {
            "title": article.title_original,
            "author": article.author or "Non spécifié",
            "media": media_name,
            "date": article.published_at.isoformat() if article.published_at else "Date inconnue",
            "content": content,
        },
        "required_output": {
            "translated_title": "titre traduit en français",
            "thesis_summary": "résumé de la thèse en une phrase courte (max 15 mots)",
            "summary_fr": "résumé de 150-200 mots en français, ton neutre restitutif",
            "key_quotes_fr": ["citation traduite 1", "citation traduite 2"],
            "article_type": "opinion|editorial|tribune|analysis|news|interview|reportage",
            "entities": [
                {"name": "nom", "type": "PERSON|ORG|GPE|EVENT", "name_fr": "nom en français"}
            ],
            "confidence_score": "float entre 0.0 et 1.0 — confiance dans la qualité de traduction",
            "translation_notes": "difficultés de traduction éventuelles, termes ambigus"
        }
    }, ensure_ascii=False)


class TranslationPipeline:
    """Translates and summarizes articles using Claude Haiku 4.5."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.session_factory = get_session_factory()

    async def process_pending_articles(self, limit: int = 50) -> dict:
        """Process all articles with status 'collected'."""
        async with self.session_factory() as db:
            result = await db.execute(
                select(Article)
                .where(Article.status == "collected")
                .where(Article.content_original.isnot(None))
                .order_by(Article.collected_at.desc())
                .limit(limit)
            )
            articles = result.scalars().all()

        logger.info(f"Processing {len(articles)} pending articles")
        stats = {"processed": 0, "errors": 0}

        for article in articles:
            try:
                await self._process_article(article)
                stats["processed"] += 1
            except Exception as e:
                stats["errors"] += 1
                logger.error(f"Error processing article {article.id}: {e}")
                async with self.session_factory() as db:
                    art = await db.get(Article, article.id)
                    if art:
                        art.status = "error"
                        art.processing_error = str(e)[:500]
                        await db.commit()

        logger.info(f"Processing complete: {stats['processed']} done, {stats['errors']} errors")
        return stats

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _process_article(self, article: Article):
        """Process a single article through the LLM pipeline."""
        # Get media source name
        async with self.session_factory() as db:
            from src.models.database import MediaSource
            source = await db.get(MediaSource, article.media_source_id)
            media_name = source.name if source else "Unknown"

        # Skip if already in French (from OLJ, Orient XXI, Le Monde diplo, etc.)
        if article.source_language == "fr":
            await self._process_french_article(article, media_name)
            return

        # Call Claude Haiku for translation + summarization
        user_prompt = _build_user_prompt(article, media_name)

        response = self.client.messages.create(
            model=settings.translation_model,
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        # Parse response
        response_text = response.content[0].text
        try:
            data = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            import re
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                raise ValueError(f"Invalid JSON response: {response_text[:200]}")

        # Update article in database
        async with self.session_factory() as db:
            art = await db.get(Article, article.id)
            if art:
                art.title_fr = data.get("translated_title", "")
                art.thesis_summary_fr = data.get("thesis_summary", "")
                art.summary_fr = data.get("summary_fr", "")
                art.key_quotes_fr = data.get("key_quotes_fr", [])
                art.article_type = data.get("article_type", "other")
                art.translation_confidence = data.get("confidence_score", 0.0)
                art.translation_notes = data.get("translation_notes", "")
                art.status = "translated"
                art.processed_at = datetime.now(timezone.utc)
                await db.commit()

        logger.info(
            f"Translated article {article.id} "
            f"(confidence: {data.get('confidence_score', 'N/A')})"
        )

    async def _process_french_article(self, article: Article, media_name: str):
        """Process articles already in French (summarize only, no translation)."""
        content = article.content_original or article.title_original
        words = content.split()
        if len(words) > 4000:
            content = " ".join(words[:4000])

        prompt = json.dumps({
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
                "entities": [{"name": "nom", "type": "PERSON|ORG|GPE|EVENT", "name_fr": "nom"}],
            }
        }, ensure_ascii=False)

        response = self.client.messages.create(
            model=settings.translation_model,
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        data = json.loads(response.content[0].text)

        async with self.session_factory() as db:
            art = await db.get(Article, article.id)
            if art:
                art.title_fr = article.title_original  # Keep original French title
                art.thesis_summary_fr = data.get("thesis_summary", "")
                art.summary_fr = data.get("summary_fr", "")
                art.key_quotes_fr = data.get("key_quotes_fr", [])
                art.article_type = data.get("article_type", "other")
                art.translation_confidence = 1.0  # Native French
                art.status = "translated"
                art.processed_at = datetime.now(timezone.utc)
                await db.commit()


async def run_translation_pipeline():
    """Entry point for the translation job."""
    pipeline = TranslationPipeline()
    return await pipeline.process_pending_articles()
