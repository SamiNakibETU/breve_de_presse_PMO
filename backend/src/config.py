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
