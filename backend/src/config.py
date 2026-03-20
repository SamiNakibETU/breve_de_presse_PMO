from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/press_review",
    )

    # --- Embedding (Cohere) ---
    cohere_api_key: str | None = Field(default=None)

    # --- LLM provider keys (set at least one) ---
    anthropic_api_key: str = Field(default="")
    groq_api_key: str = Field(default="")
    cerebras_api_key: str = Field(default="")

    # --- Anthropic models (fallback / Hebrew) ---
    anthropic_translation_model: str = Field(default="claude-haiku-4-5-20241022")
    anthropic_generation_model: str = Field(default="claude-sonnet-4-5-20241022")
    anthropic_use_prompt_cache: bool = Field(
        default=True,
        description="Anthropic : cache éphémère sur le bloc system (réduction coût)",
    )

    # --- Groq models (EN/FR translation + OLJ generation) ---
    groq_translation_model: str = Field(
        default="meta-llama/llama-4-scout-17b-16e-instruct",
    )
    groq_translation_model_fallback: str = Field(
        default="llama-3.1-8b-instant",
        description="Modèle Groq plus petit si 429 / quota sur le modèle principal (EN/FR)",
    )
    groq_generation_model: str = Field(default="llama-3.3-70b-versatile")

    # --- Cerebras models (AR/FA/TR/KU translation) ---
    cerebras_translation_model: str = Field(default="qwen-3-235b-a22b")

    collection_hour_utc: int = Field(default=6)
    max_articles_per_source: int = Field(default=20)
    opinion_hub_min_articles_saved: int = Field(
        default=3,
        ge=1,
        le=30,
        description="Objectif minimum d’articles nouveaux bien formatés par source (hubs opinion)",
    )
    opinion_hub_max_article_url_attempts: int = Field(
        default=60,
        ge=10,
        le=200,
        description="Nombre max d’URLs article à tester pour atteindre l’objectif ci-dessus",
    )
    opinion_hub_min_article_words: int = Field(
        default=45,
        ge=25,
        le=150,
        description="Nombre minimum de mots pour accepter un corps d’article (hubs)",
    )
    request_delay_seconds: float = Field(default=1.5)
    user_agent: str = Field(
        default="OLJ-PressReview/1.0 (editorial-research; contact@lorientlejour.com)",
    )

    min_article_length: int = Field(default=200)
    translation_confidence_threshold: float = Field(default=0.7)
    max_translation_failures: int = Field(
        default=5,
        ge=1,
        le=50,
        description="Après N échecs LLM/parsing, l’article n’est plus repris en file traduction",
    )
    translation_auto_max_age_days: int = Field(
        default=14,
        ge=0,
        le=365,
        description="File traduction auto : seulement articles avec "
        "COALESCE(published_at, collected_at) dans les N derniers jours ; 0 = pas de filtre date",
    )
    ingestion_rss_entry_max_age_days: int = Field(
        default=7,
        ge=0,
        le=365,
        description="Collecte RSS : ignorer une entrée si sa date publiée / MAJ est plus vieille que N jours ; "
        "0 = pas de filtre (sauf limite items du flux)",
    )
    summary_min_words: int = Field(default=150)
    summary_max_words: int = Field(default=200)

    hdbscan_min_cluster_size: int = Field(default=6)
    hdbscan_min_samples: int = Field(default=5)
    hdbscan_cluster_method: str = Field(default="leaf")
    # Fenêtre temporelle et périmètre pour le clustering (revue éditoriale)
    clustering_window_hours: int = Field(
        default=48,
        ge=12,
        le=168,
        description="Articles avec embedding pris sur les N dernières heures",
    )
    cluster_only_editorial_types: bool = Field(
        default=True,
        description="Ne clusteriser que opinion, editorial, tribune, analysis",
    )
    cluster_refinement_max_size: int = Field(
        default=72,
        ge=24,
        le=500,
    )
    clustering_use_umap: bool = Field(
        default=True,
        description="UMAP 5D avant HDBSCAN (recommandé MEMW)",
    )
    umap_n_neighbors: int = Field(default=15, ge=2, le=200)
    umap_n_components: int = Field(default=5, ge=2, le=50)
    umap_min_dist: float = Field(default=0.0, ge=0.0, le=0.99)
    clustering_soft_assign_min_cosine: float = Field(
        default=0.65,
        ge=0.3,
        le=0.95,
        description="Similarité cosinus minimale (vecteurs normalisés) pour soft-assign ; "
        "le MEMW cite parfois 0.35 en « distance » — voir MEMW §2.3.6 et note dans le doc.",
    )
    memw_compat_soft_cosine: float | None = Field(
        default=None,
        ge=0.1,
        le=0.95,
        description="Non utilisé par défaut ; réservé à des expérimentations de seuil type MEMW.",
    )
    embed_only_editorial_types: bool = Field(
        default=True,
        description="N'embedder que opinion/editorial/tribune/analysis (économise Cohere + bruit)",
    )

    port: int = Field(default=8000)
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")
    log_json: bool = Field(
        default=False,
        description="Logs structlog au format JSON (recommandé avec LOG_JSON=true en prod)",
    )
    expose_metrics: bool = Field(
        default=True,
        description="Expose GET /api/metrics (désactiver si endpoint public non souhaité)",
    )
    translation_json_repair: bool = Field(
        default=True,
        description="Une 2ᵉ passe LLM si le JSON de traduction est invalide (coût latence + tokens)",
    )
    internal_api_key: str | None = Field(
        default=None,
        description="Si défini, endpoints sensibles exigent le header X-Internal-Key",
    )
    llm_use_json_object_mode: bool = Field(
        default=True,
        description="Groq/Cerebras : response_format json_object pour la traduction (repli auto si refus API)",
    )
    llm_translation_cache_max_entries: int = Field(
        default=0,
        ge=0,
        le=10_000,
        description="Cache LRU mémoire des réponses traduction ; 0 = désactivé",
    )
    frontend_url: str = Field(default="http://localhost:3000")
    # Origines CORS supplémentaires (séparées par des virgules), ex. staging + previews Vercel
    cors_origins: str = Field(default="")
    hub_html_cache_ttl_seconds: int = Field(
        default=0,
        ge=0,
        le=86400,
        description="TTL cache disque HTML hubs (0 = désactivé). Ex. 900 = 15 min.",
    )

    ingestion_llm_gate_enabled: bool = Field(
        default=True,
        description="Gate LLM (Haiku/Groq) pour titres à signal géopolitique ambigu",
    )
    ingestion_llm_gate_post_body_enabled: bool = Field(
        default=False,
        description="Après extraction page : second passage gate LLM titre+extrait corps (coût suppl.)",
    )
    ingestion_llm_gate_summary_max_chars: int = Field(
        default=1100,
        ge=200,
        le=4000,
        description="Longueur max. texte envoyée au gate (résumé RSS ou extrait corps), ~150–200 mots",
    )
    low_quality_confidence_threshold: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="En dessous : statut low_quality (masqué par défaut en liste)",
    )
    olj_generation_anthropic_only: bool = Field(
        default=False,
        description="Revue OLJ : uniquement Claude Sonnet, échec si pas de clé Anthropic",
    )
    olj_generation_thesis_sonnet_summary_groq: bool = Field(
        default=False,
        description="Thèse « » via Sonnet, paragraphe Résumé via Groq (variante coût)",
    )
    cod_multi_pass_enabled: bool = Field(
        default=True,
        description="Chain of Density : 3 passes LLM pour articles à forte pertinence",
    )
    cod_multi_pass_min_relevance: int = Field(
        default=80,
        ge=0,
        le=100,
        description="Seuil score editorial_relevance (expliqué) pour activer les 3 passes",
    )
    emergence_max_cosine_previous: float = Field(
        default=0.4,
        ge=0.1,
        le=0.95,
        description="MEMW J/J-1 : émergent si aucun centroïde veille > ce cosinus",
    )
    emergence_min_distinct_countries: int = Field(
        default=3,
        ge=2,
        le=20,
        description="Nombre minimum de pays distincts pour marquer un cluster émergent",
    )
    body_simhash_max_hamming: int = Field(
        default=13,
        ge=1,
        le=32,
        description="Seuil Hamming 64 bits (~80 % similarité SimHash corps)",
    )
    alert_webhook_url: str | None = Field(
        default=None,
        description="POST JSON si source health dead (optionnel)",
    )
    alert_email_webhook_url: str | None = Field(
        default=None,
        description="POST JSON additionnel (même schéma que alert_webhook_url), ex. Zapier e-mail",
    )
    resend_api_key: str | None = Field(
        default=None,
        description="Clé Resend pour alertes e-mail (optionnel, avec alert_email_to)",
    )
    alert_email_to: str | None = Field(
        default=None,
        description="Destinataires alertes e-mail, virgules (ex. a@x.com,b@y.com)",
    )
    alert_email_from: str | None = Field(
        default="MEMW Alerts <onboarding@resend.dev>",
        description="Expéditeur Resend (domaine vérifié en prod)",
    )
    pdf_unicode_font_path: str | None = Field(
        default=None,
        description="Chemin .ttf Unicode (ex. DejaVuSans.ttf) ; sinon recherche chemins système puis repli ASCII",
    )
    alert_cluster_article_threshold: int | None = Field(
        default=None,
        ge=1,
        description="Si défini : webhook type cluster_hot quand un sujet dépasse ce seuil "
        "(articles_total ou articles_last_7d), une fois à la montée",
    )
    anthropic_batch_enabled: bool = Field(
        default=False,
        description="File batch Anthropic nocturne (non bloquant si false)",
    )
    anthropic_batch_max_requests: int = Field(
        default=24,
        ge=1,
        le=100,
        description="Nombre max de messages par batch Anthropic",
    )
    pdf_export_enabled: bool = Field(
        default=False,
        description="Export PDF revue (nécessite fpdf2) ; false → 501 explicite",
    )
    store_full_translation_fr: bool = Field(
        default=False,
        description="Si true : demander et persister content_translated_fr (corps FR complet, coût tokens)",
    )
    translation_english_summary_only: bool = Field(
        default=False,
        description="Articles EN : métadonnées + résumé FR uniquement ; corps inchangé (content_original)",
    )

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": False,
    }


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
