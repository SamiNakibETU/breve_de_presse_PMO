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
from typing import Any, Callable, Literal, Optional

import structlog
from sqlalchemy import select
from tenacity import RetryError, retry, stop_after_attempt, wait_exponential

from src.config import get_settings
from src.database import get_session_factory
from src.models.article import Article
from src.models.media_source import MediaSource
from src.services import metrics as app_metrics
from src.services.editorial_event_service import resolve_or_create_event_for_article
from src.services.entity_service import upsert_entities
from src.services.llm_router import get_llm_router
from src.services.olj_glossary import glossary_prompt_block_for_topics
from src.services.olj_taxonomy import taxonomy_prompt_block, validate_olj_topic_ids

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


def _augmented_system_prompt() -> str:
    """Taxonomie + glossaire OLJ pour classification contrainte."""
    try:
        tax_block = taxonomy_prompt_block()
        gloss = glossary_prompt_block_for_topics([])
    except Exception:
        return SYSTEM_PROMPT
    gloss_part = f"\n{gloss}\n" if gloss else ""
    return (
        SYSTEM_PROMPT
        + "\n\nTHÉMATIQUES OLJ — renseigner olj_topic_ids : liste de 1 à 5 identifiants "
        "parmi la taxonomie ci-dessous (sinon [\"other\"]).\n"
        + tax_block
        + "\n"
        + gloss_part
    )


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
                "article_family": "même valeur que article_type (rédaction / famille éditoriale)",
                "olj_topic_ids": ["mena.geopolitics", "other"],
                "stance_summary": "UNE phrase neutre restitutive : ligne argumentaire de l'auteur",
                "event_extraction": {
                    "who": "acteur principal ou ?",
                    "what": "fait ou enjeu central",
                    "where": "lieu ou région ou ?",
                    "when": "période ou ?",
                    "canonical_event_label_fr": "libellé court factuel pour indexation",
                    "completeness_0_1": 0.5,
                },
                "source_spans": [
                    {
                        "text_excerpt": "extrait source représentatif (≤200 car.)",
                        "role": "quote",
                    }
                ],
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
                "article_family": "même valeur que article_type",
                "olj_topic_ids": ["mena.geopolitics", "other"],
                "stance_summary": "UNE phrase neutre restitutive",
                "event_extraction": {
                    "who": "?",
                    "what": "?",
                    "where": "?",
                    "when": "?",
                    "canonical_event_label_fr": "libellé court",
                    "completeness_0_1": 0.5,
                },
                "source_spans": [{"text_excerpt": "extrait", "role": "quote"}],
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


REPAIR_JSON_SYSTEM = """Tu renvoies UNIQUEMENT un objet JSON valide (UTF-8), sans markdown, sans backticks.
Corrige guillemets, virgules finales et accolades pour que json.loads() réussisse.
Conserve les clés et le sens du contenu s'ils sont reconnaissables."""


async def _parse_translation_llm_json(
    router: Any,
    raw_text: str,
    language: str,
) -> dict:
    """Parse la réponse traduction ; une seule passe LLM de réparation si activée."""
    try:
        return _parse_llm_json(raw_text)
    except ValueError as first_err:
        if not settings.translation_json_repair:
            raise
        snippet = (raw_text or "")[:12000]
        repair_prompt = (
            "Le bloc suivant devait être un JSON unique mais est syntaxiquement invalide. "
            "Renvoie uniquement le JSON corrigé.\n\n"
            f"{snippet}"
        )
        app_metrics.inc("translation.json_repair_attempts")
        logger.info("translation.json_repair_attempt", snippet_chars=len(snippet))
        repaired = await router.translate(
            system=REPAIR_JSON_SYSTEM,
            prompt=repair_prompt,
            language=language,
            max_tokens=2000,
        )
        try:
            data = _parse_llm_json(repaired)
        except ValueError:
            app_metrics.inc("translation.json_repair_failed")
            raise first_err from None
        app_metrics.inc("translation.json_repair_success")
        logger.info("translation.json_repair_success")
        return data


def _classify_translation_error(exc: Exception) -> str:
    """Catégorie courte pour agréger les échecs (logs + réponse pipeline)."""
    if isinstance(exc, RetryError):
        return "retry_exhausted"

    if isinstance(exc, ValueError):
        msg = str(exc)
        if "Cannot parse JSON" in msg:
            return "json_parse"
        return "value_error"

    mod = type(exc).__module__
    name = type(exc).__name__

    if "openai" in mod:
        if "RateLimit" in name or "429" in str(exc):
            return "rate_limit"
        if "Authentication" in name or "PermissionDenied" in name:
            return "auth"
        if "APIConnection" in name or "ConnectError" in name or "APITimeout" in name:
            return "connection"
        if "API" in name and "Error" in name:
            return "llm_api"

    if "anthropic" in mod:
        if "RateLimit" in name:
            return "rate_limit"
        if "Authentication" in name:
            return "auth"
        if "API" in name and "Error" in name:
            return "llm_api"

    return "other"


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
        self._stats_lock = asyncio.Lock()

    async def process_pending(
        self,
        limit: int = 300,
        on_progress: Optional[Callable[[str, str], None]] = None,
    ) -> dict:
        if on_progress:
            on_progress("select", "Sélection des articles en file…")
        async with self._factory() as db:
            result = await db.execute(
                select(Article)
                .where(Article.status.in_(["collected", "error"]))
                .where(Article.content_original.isnot(None))
                .where(
                    Article.translation_failure_count
                    < settings.max_translation_failures,
                )
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
        stats: dict = {
            "processed": 0,
            "errors": 0,
            "needs_review": 0,
            "skipped": skipped,
            "error_breakdown": {},
            "error_samples": [],
        }

        if on_progress:
            n = len(to_process)
            on_progress(
                "llm",
                f"Traduction LLM ({n} article{'s' if n != 1 else ''}, parallèle limitée)…",
            )

        tasks = [self._process_one(a, stats) for a in to_process]
        await asyncio.gather(*tasks)

        if on_progress:
            on_progress("done", "Finalisation traduction…")

        logger.info(
            "translation.complete",
            processed=stats["processed"],
            errors=stats["errors"],
            needs_review=stats["needs_review"],
            skipped=stats["skipped"],
            error_breakdown=stats["error_breakdown"],
        )
        return stats

    async def _process_one(self, article: Article, stats: dict) -> None:
        structlog.contextvars.bind_contextvars(article_id=str(article.id))
        async with self._semaphore:
            try:
                outcome = await self._process_article(article)
                async with self._stats_lock:
                    if outcome is not None:
                        stats["processed"] += 1
                        if outcome == "needs_review":
                            stats["needs_review"] += 1
                        app_metrics.inc("translation.article.success")
            except Exception as exc:
                reason = _classify_translation_error(exc)
                app_metrics.inc(f"translation.article_error.{reason}")
                async with self._stats_lock:
                    stats["errors"] += 1
                    bd = stats["error_breakdown"]
                    bd[reason] = bd.get(reason, 0) + 1
                    samples: list = stats["error_samples"]
                    if len(samples) < 8:
                        samples.append(
                            {
                                "article_id": str(article.id),
                                "reason": reason,
                                "message": str(exc)[:200],
                            }
                        )
                logger.error(
                    "translation.article_error",
                    article_id=str(article.id),
                    reason=reason,
                    error=str(exc)[:200],
                )
                async with self._factory() as db:
                    art = await db.get(Article, article.id)
                    if art:
                        art.processing_error = str(exc)[:500]
                        art.translation_failure_count = (
                            art.translation_failure_count + 1
                        )
                        if (
                            art.translation_failure_count
                            >= settings.max_translation_failures
                        ):
                            art.status = "translation_abandoned"
                        else:
                            art.status = "error"
                        await db.commit()
            finally:
                structlog.contextvars.unbind_contextvars("article_id")
                await asyncio.sleep(0.5)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _process_article(
        self,
        article: Article,
    ) -> Optional[Literal["translated", "needs_review"]]:
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
            system=_augmented_system_prompt(),
            prompt=prompt,
            language=lang,
            max_tokens=2000,
        )

        data = await _parse_translation_llm_json(self._router, raw_text, lang)

        content = article.content_original or ""
        used_rss_fallback = len(content.split()) < 300

        confidence = compute_confidence(article, data, is_french, used_rss_fallback)

        if confidence < settings.translation_confidence_threshold:
            status: Literal["translated", "needs_review"] = "needs_review"
        else:
            status = "translated"

        async with self._factory() as db:
            art = await db.get(Article, article.id)
            if not art:
                return None

            if is_french:
                art.title_fr = article.title_original
            else:
                art.title_fr = data.get("translated_title", "")

            art.thesis_summary_fr = data.get("thesis_summary", "")
            art.summary_fr = data.get("summary_fr", "")
            art.key_quotes_fr = data.get("key_quotes_fr", [])
            art.article_type = data.get("article_type", "other")
            olj_ids = validate_olj_topic_ids(data.get("olj_topic_ids"))
            if not olj_ids:
                olj_ids = validate_olj_topic_ids(["other"])
            art.olj_topic_ids = olj_ids
            fam = data.get("article_family") or art.article_type or "other"
            art.article_family = str(fam)[:30]
            stance = data.get("stance_summary")
            art.stance_summary = stance.strip()[:2000] if isinstance(stance, str) else None
            ev = data.get("event_extraction")
            art.event_extraction_json = ev if isinstance(ev, dict) else None
            spans = data.get("source_spans")
            art.source_spans_json = spans if isinstance(spans, list) else None
            eid = await resolve_or_create_event_for_article(
                db,
                extraction=art.event_extraction_json,
            )
            art.primary_editorial_event_id = eid
            art.translation_confidence = confidence
            art.translation_notes = data.get("translation_notes", "")
            art.status = status
            art.processed_at = datetime.now(timezone.utc)
            art.translation_failure_count = 0
            art.processing_error = None
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
        return status


async def run_translation_pipeline(
    limit: int = 300,
    on_progress: Optional[Callable[[str, str], None]] = None,
) -> dict:
    pipeline = TranslationPipeline()
    return await pipeline.process_pending(limit=limit, on_progress=on_progress)
