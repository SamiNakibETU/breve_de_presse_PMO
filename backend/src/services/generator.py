"""
OLJ format press review generator using hybrid LLM routing (async).
Generates copy-paste-ready blocks matching Emilie's exact format.
"""

import hashlib
import json
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import delete, select

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.media_source import MediaSource
from src.models.review import Review, ReviewItem
from src.services.llm_router import get_llm_router
from src.services.olj_glossary import glossary_prompt_block_for_topics

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
francophone libanais de référence. Tu produis un bloc texte pour la revue de presse \
régionale quotidienne.

FORMAT EXACT à produire — respecte-le à la lettre, sans rien ajouter :

« [Phrase-thèse percutante qui capture la conviction de l'auteur] »

Résumé : [Résumé de 150 à 200 mots EXACTEMENT. Ton neutre, restitution fidèle. \
Français soutenu mais accessible. Présent de narration. Attribution systématique.]

Fiche :
Article publié dans [nom exact du média]
Le [JJ mois AAAA]
Langue originale : [langue]
Pays du média : [pays]
Nom de l'auteur : [auteur ou "Éditorial non signé"]

RÈGLES ABSOLUES :
1. Le titre entre « » est UNE PHRASE assertive qui capture la conviction de l'auteur, \
comme s'il la prononçait. PAS un résumé en deux parties avec tiret. PAS un titre \
d'article. UNE PHRASE-THÈSE percutante. Exemples corrects : \
« La guerre contre les pays du Golfe est une hérésie » \
« Le régime iranien sortira encore plus radicalisé de cette guerre » \
« Le gouvernement israélien veut rétablir le Grand Israël, et voilà tout »
2. Le résumé fait STRICTEMENT entre 150 et 200 mots — COMPTE PRÉCISÉMENT
3. Restitution strictement fidèle, aucun jugement de valeur
4. Guillemets français « » pour toute citation
5. Si opinion/tribune : "L'auteur estime que...", "Selon le chroniqueur..."
6. Si analyse factuelle : "L'analyste rapporte que...", "Selon les sources citées..."
7. TOUT le texte en français. Traduire TOUTES les citations. AUCUN texte en langue \
étrangère sauf noms propres.
8. Translittération simplifiée des noms propres arabes

Produis UNIQUEMENT le bloc formaté. PAS de commentaire. PAS de "Voici le bloc". \
PAS de séparateur. RIEN d'autre que le bloc."""


def _format_date_fr(dt: datetime | None) -> str:
    if not dt:
        return "Date inconnue"
    return f"{dt.day} {MOIS_FR.get(dt.month, '')} {dt.year}"


def _count_words(text: str) -> int:
    return len(text.split())


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

        tids = (
            article.olj_topic_ids
            if isinstance(article.olj_topic_ids, list)
            else None
        )
        gloss = glossary_prompt_block_for_topics(
            [str(x) for x in tids if isinstance(x, str)] if tids else [],
        )
        gloss_block = f"\n{gloss}\n" if gloss else ""

        user_prompt = f"""Produis le bloc revue de presse OLJ pour cet article :
{gloss_block}
TITRE ORIGINAL : {article.title_original}
TITRE TRADUIT : {article.title_fr or article.title_original}
THÈSE DE L'AUTEUR : {article.thesis_summary_fr or 'Non disponible'}
RÉSUMÉ EXISTANT : {article.summary_fr or 'Non disponible'}
CITATIONS CLÉS : {json.dumps(article.key_quotes_fr or [], ensure_ascii=False)}
TYPE D'ARTICLE : {article.article_type or 'opinion'}

INFORMATIONS FICHE :
- Média : {source.name}
- Date de publication : {pub_date}
- Langue originale : {langue}
- Pays du média : {pays}
- Auteur : {article.author or 'Éditorial non signé'}

RAPPEL : le titre entre « » doit être UNE PHRASE-THÈSE assertive et percutante \
qui capture la conviction de l'auteur. PAS un résumé avec tiret. \
Le résumé doit faire EXACTEMENT 150-200 mots — compte précisément."""

        formatted_block = await self._router.generate(
            system=OLJ_SYSTEM_PROMPT,
            prompt=user_prompt,
            max_tokens=1000,
        )
        formatted_block = formatted_block.strip()

        summary_section = self._extract_summary(formatted_block)
        if summary_section:
            wc = _count_words(summary_section)
            if wc < 140 or wc > 220:
                logger.warning(
                    "generator.word_count_off",
                    article_id=str(article_id),
                    word_count=wc,
                )

        async with self._factory() as db:
            art = await db.get(Article, article_id)
            if art:
                art.olj_formatted_block = formatted_block
                art.status = "formatted"
                await db.commit()

        logger.info("generator.block_done", article_id=str(article_id))
        return formatted_block

    @staticmethod
    def _extract_summary(block: str) -> str | None:
        lines = block.split("\n")
        for i, line in enumerate(lines):
            if line.strip().startswith("Résumé"):
                text = line.split(":", 1)[-1].strip()
                for j in range(i + 1, len(lines)):
                    if lines[j].strip().startswith("Fiche"):
                        break
                    text += " " + lines[j].strip()
                return text.strip()
        return None

    async def generate_full_review(
        self,
        article_ids: list[str],
        created_by: str | None = None,
    ) -> dict:
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

        full_text = "\n\n".join(blocks)

        today = datetime.now(timezone.utc)
        snap_hash = hashlib.sha256(
            (json.dumps(article_ids, sort_keys=True) + "|" + full_text[:8000]).encode(),
        ).hexdigest()
        gen_hash = hashlib.sha256(OLJ_SYSTEM_PROMPT.encode()).hexdigest()
        review_id = await self._persist_review(
            article_ids,
            full_text,
            today,
            created_by=created_by,
            content_snapshot_hash=snap_hash,
            generation_prompt_hash=gen_hash,
        )

        return {
            "review_id": str(review_id),
            "full_text": full_text,
            "article_count": len(article_ids),
            "content_snapshot_hash": snap_hash,
            "generation_prompt_hash": gen_hash,
        }

    async def _persist_review(
        self,
        article_ids: list[str],
        full_text: str,
        now: datetime,
        *,
        created_by: str | None = None,
        content_snapshot_hash: str | None = None,
        generation_prompt_hash: str | None = None,
    ) -> uuid.UUID:
        async with self._factory() as db:
            existing = await db.execute(
                select(Review).where(Review.review_date == now.date())
            )
            review = existing.scalar_one_or_none()

            if review:
                review.full_text = full_text
                review.status = "ready"
                if created_by:
                    review.created_by = created_by
                if content_snapshot_hash:
                    review.content_snapshot_hash = content_snapshot_hash
                if generation_prompt_hash:
                    review.generation_prompt_hash = generation_prompt_hash
                await db.execute(
                    delete(ReviewItem).where(ReviewItem.review_id == review.id)
                )
            else:
                review = Review(
                    title=f"Revue de presse régionale — {_format_date_fr(now)}",
                    review_date=now.date(),
                    status="ready",
                    full_text=full_text,
                    created_by=created_by,
                    content_snapshot_hash=content_snapshot_hash,
                    generation_prompt_hash=generation_prompt_hash,
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
