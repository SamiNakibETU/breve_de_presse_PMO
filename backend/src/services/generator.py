"""
OLJ format press review generator using hybrid LLM routing (async).
Default: Groq Llama 3.3 70B for generation, falls back to Anthropic if unavailable.
Generates the final copy-paste-ready block and persists reviews.
"""

import json
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.media_source import MediaSource
from src.models.review import Review, ReviewItem
from src.services.llm_router import get_llm_router

logger = structlog.get_logger(__name__)
settings = get_settings()

MOIS_FR = {
    1: "janvier",
    2: "février",
    3: "mars",
    4: "avril",
    5: "mai",
    6: "juin",
    7: "juillet",
    8: "août",
    9: "septembre",
    10: "octobre",
    11: "novembre",
    12: "décembre",
}

LANGUAGE_MAP = {
    "ar": "arabe",
    "en": "anglais",
    "he": "hébreu",
    "fa": "persan",
    "tr": "turc",
    "fr": "français",
    "ku": "kurde",
}

COUNTRY_MAP = {
    "LB": "Liban",
    "IL": "Israël",
    "IR": "Iran",
    "AE": "Émirats arabes unis",
    "SA": "Arabie saoudite",
    "TR": "Turquie",
    "IQ": "Irak",
    "SY": "Syrie",
    "QA": "Qatar",
    "JO": "Jordanie",
    "KW": "Koweït",
    "BH": "Bahreïn",
    "YE": "Yémen",
    "EG": "Égypte",
    "US": "États-Unis",
    "GB": "Royaume-Uni",
    "FR": "France",
}

OLJ_SYSTEM_PROMPT = """Tu es rédacteur en chef adjoint à L'Orient-Le Jour, quotidien \
francophone libanais de référence. Tu produis le bloc texte final de la revue de presse \
régionale quotidienne.

FORMAT EXACT à produire :

« [Titre synthétique reformulé — Thèse de l'auteur en une phrase] »

Résumé : [Résumé de 150-200 mots exactement. Ton neutre, restitution fidèle de l'argument \
de l'auteur. Français soutenu mais accessible. Présent de narration. Attribution systématique.]

Fiche :
Article publié dans [nom exact du média]
Le [date au format : JJ mois AAAA, ex: 18 mars 2026]
Langue originale : [langue en toutes lettres : arabe/anglais/hébreu/persan/turc/français/kurde]
Pays du média : [pays en français]
Nom de l'auteur : [auteur ou "Éditorial non signé"]

RÈGLES ABSOLUES :
1. Le titre entre « » DOIT être reformulé, JAMAIS traduit littéralement
2. La thèse après le tiret résume la position de l'auteur en max 10 mots
3. Le résumé DOIT faire entre 150 et 200 mots — compte précisément
4. Aucun jugement de valeur — restitution strictement fidèle
5. Guillemets français « » pour toute citation traduite
6. Translittération simplifiée des noms propres arabes
7. Si l'article est une opinion/tribune : "L'auteur estime que...", "Selon le chroniqueur..."
8. Si l'article est une analyse factuelle : "L'analyste rapporte que...", "Selon les sources citées..."
9. Le format de date dans la Fiche est TOUJOURS "JJ mois AAAA" en français

Produis UNIQUEMENT le bloc formaté, sans commentaire ni explication."""


def _format_date_fr(dt: datetime | None) -> str:
    if not dt:
        return "Date inconnue"
    return f"{dt.day} {MOIS_FR.get(dt.month, '')} {dt.year}"


class PressReviewGenerator:
    def __init__(self) -> None:
        self._router = get_llm_router()
        self._factory = get_session_factory()

    async def generate_block(self, article_id: str | uuid.UUID) -> str:
        async with self._factory() as db:
            article = await db.get(Article, article_id)
            if not article:
                raise ValueError(f"Article {article_id} not found")

            source = await db.get(MediaSource, article.media_source_id)
            if not source:
                raise ValueError(f"Source {article.media_source_id} not found")

        pub_date = _format_date_fr(article.published_at)
        langue = LANGUAGE_MAP.get(
            article.source_language or "", article.source_language or "inconnue"
        )
        pays = COUNTRY_MAP.get(source.country_code, source.country)

        user_prompt = f"""Produis le bloc revue de presse OLJ pour cet article :

TITRE ORIGINAL : {article.title_original}
TITRE TRADUIT : {article.title_fr or article.title_original}
THÈSE RÉSUMÉE : {article.thesis_summary_fr or 'Non disponible'}
RÉSUMÉ EXISTANT : {article.summary_fr or 'Non disponible'}
CITATIONS CLÉS : {json.dumps(article.key_quotes_fr or [], ensure_ascii=False)}
TYPE D'ARTICLE : {article.article_type or 'opinion'}

INFORMATIONS FICHE :
- Média : {source.name}
- Date de publication : {pub_date}
- Langue originale : {langue}
- Pays du média : {pays}
- Auteur : {article.author or 'Éditorial non signé'}

Produis le bloc OLJ final, en retravaillant le résumé existant si nécessaire \
pour qu'il atteigne exactement 150-200 mots et respecte parfaitement le style OLJ."""

        formatted_block = await self._router.generate(
            system=OLJ_SYSTEM_PROMPT,
            prompt=user_prompt,
            max_tokens=1000,
        )
        formatted_block = formatted_block.strip()

        async with self._factory() as db:
            art = await db.get(Article, article_id)
            if art:
                art.olj_formatted_block = formatted_block
                art.status = "formatted"
                await db.commit()

        logger.info("generator.block_done", article_id=str(article_id))
        return formatted_block

    async def generate_full_review(self, article_ids: list[str]) -> dict:
        """Generate complete review, persist it, and return the result."""
        blocks: list[str] = []
        for aid in article_ids:
            try:
                block = await self.generate_block(aid)
                blocks.append(block)
            except Exception as exc:
                logger.error("generator.block_error", article_id=aid, error=str(exc))
                blocks.append(
                    f"[ERREUR : impossible de générer le bloc pour l'article {aid}]"
                )

        separator = "\n\n" + "\u2500" * 60 + "\n\n"
        today = datetime.now(timezone.utc)
        date_fr = f"{today.day} {MOIS_FR[today.month]} {today.year}"
        header = f"REVUE DE PRESSE RÉGIONALE — {date_fr}\n\n"
        full_text = header + separator.join(blocks)

        review_id = await self._persist_review(article_ids, full_text, today)

        return {
            "review_id": str(review_id),
            "full_text": full_text,
            "article_count": len(article_ids),
        }

    async def _persist_review(
        self,
        article_ids: list[str],
        full_text: str,
        now: datetime,
    ) -> uuid.UUID:
        async with self._factory() as db:
            existing = await db.execute(
                select(Review).where(Review.review_date == now.date())
            )
            review = existing.scalar_one_or_none()

            if review:
                review.full_text = full_text
                review.status = "ready"
            else:
                review = Review(
                    title=f"Revue de presse régionale — {_format_date_fr(now)}",
                    review_date=now.date(),
                    status="ready",
                    full_text=full_text,
                )
                db.add(review)
                await db.flush()

            for idx, aid in enumerate(article_ids):
                db.add(
                    ReviewItem(
                        review_id=review.id,
                        article_id=uuid.UUID(aid),
                        display_order=idx + 1,
                    )
                )

            await db.commit()
            return review.id
