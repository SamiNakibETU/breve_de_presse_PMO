"""
OLJ Press Review — Final Format Generator
Generates the copy-paste ready press review block in OLJ format.
Uses Claude Sonnet 4.5 for superior French writing quality.
"""

import json
import logging
from datetime import datetime, timezone
from typing import List

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.database import Article, MediaSource, get_session_factory

logger = logging.getLogger(__name__)
settings = get_settings()

OLJ_SYSTEM_PROMPT = """Tu es rédacteur en chef adjoint à L'Orient-Le Jour, quotidien 
francophone libanais de référence. Tu produis le bloc texte final de la revue de presse 
régionale quotidienne.

FORMAT EXACT à produire :

« [Titre synthétique reformulé — Thèse de l'auteur en une phrase] »

Résumé : [Résumé de 150-200 mots exactement. Ton neutre, restitution fidèle de l'argument 
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
7. Si l'article est une opinion/tribune, utiliser "L'auteur estime que...", "Selon le chroniqueur..."
8. Si l'article est une analyse factuelle, utiliser "L'analyste rapporte que...", "Selon les sources citées..."
9. Le format de date dans la Fiche est TOUJOURS "JJ mois AAAA" en français

Produis UNIQUEMENT le bloc formaté, sans commentaire ni explication."""

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


class PressReviewGenerator:
    """Generates OLJ-formatted press review blocks."""

    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.session_factory = get_session_factory()

    async def generate_block(self, article_id: str) -> str:
        """Generate OLJ formatted block for a single article."""
        async with self.session_factory() as db:
            article = await db.get(Article, article_id)
            if not article:
                raise ValueError(f"Article {article_id} not found")
            
            source = await db.get(MediaSource, article.media_source_id)
            if not source:
                raise ValueError(f"Source {article.media_source_id} not found")

        # Build prompt with article data
        pub_date = (
            article.published_at.strftime("%-d %B %Y")
            if article.published_at
            else "Date inconnue"
        )
        # French month names
        month_map = {
            "January": "janvier", "February": "février", "March": "mars",
            "April": "avril", "May": "mai", "June": "juin",
            "July": "juillet", "August": "août", "September": "septembre",
            "October": "octobre", "November": "novembre", "December": "décembre",
        }
        for en, fr in month_map.items():
            pub_date = pub_date.replace(en, fr)

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
- Langue originale : {LANGUAGE_MAP.get(article.source_language, article.source_language or 'inconnue')}
- Pays du média : {COUNTRY_MAP.get(source.country_code, source.country)}
- Auteur : {article.author or 'Éditorial non signé'}

Produis le bloc OLJ final, en retravaillant le résumé existant si nécessaire 
pour qu'il atteigne exactement 150-200 mots et respecte parfaitement le style OLJ."""

        response = self.client.messages.create(
            model=settings.formatting_model,
            max_tokens=1000,
            system=OLJ_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )

        formatted_block = response.content[0].text.strip()

        # Save to database
        async with self.session_factory() as db:
            art = await db.get(Article, article_id)
            if art:
                art.olj_formatted_block = formatted_block
                art.status = "formatted"
                await db.commit()

        logger.info(f"Generated OLJ block for article {article_id}")
        return formatted_block

    async def generate_full_review(self, article_ids: List[str]) -> str:
        """Generate complete press review from selected articles."""
        blocks = []
        for article_id in article_ids:
            try:
                block = await self.generate_block(article_id)
                blocks.append(block)
            except Exception as e:
                logger.error(f"Failed to generate block for {article_id}: {e}")
                blocks.append(f"[ERREUR : impossible de générer le bloc pour l'article {article_id}]")

        separator = "\n\n" + "─" * 60 + "\n\n"
        today = datetime.now(timezone.utc)
        
        # French date
        month_names_fr = [
            "", "janvier", "février", "mars", "avril", "mai", "juin",
            "juillet", "août", "septembre", "octobre", "novembre", "décembre"
        ]
        date_fr = f"{today.day} {month_names_fr[today.month]} {today.year}"
        
        header = f"REVUE DE PRESSE RÉGIONALE — {date_fr}\n\n"
        full_review = header + separator.join(blocks)
        
        return full_review
