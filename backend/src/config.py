from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/press_review",
    )
    # URL publique Postgres (Railway) : pour Alembic depuis ta machine (`railway run`).
    # DATABASE_URL côté service pointe souvent vers un hôte interne non résolvable en local.
    database_public_url: str | None = Field(
        default=None,
        description="Postgres URL accessible depuis l'extérieur (ex. Railway DATABASE_PUBLIC_URL)",
    )

    # --- Embedding (Cohere) ---
    cohere_api_key: str | None = Field(default=None)

    # --- LLM provider keys (set at least one) ---
    anthropic_api_key: str = Field(default="")
    groq_api_key: str = Field(default="")
    cerebras_api_key: str = Field(default="")

    # --- Anthropic models (fallback / Hebrew) ---
    # Alias officiels (docs « all-models ») : les anciens IDs 3.5 (ex. claude-3-5-haiku-20241022)
    # peuvent renvoyer 404 une fois les modèles retirés. Haiku 4.5 / Sonnet 4.5 restent listés.
    anthropic_translation_model: str = Field(default="claude-haiku-4-5")
    anthropic_generation_model: str = Field(default="claude-sonnet-4-5")
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

    collection_hour_utc: int = Field(
        default=6,
        description="Déprécié : le planificateur utilise Europe/Paris 9h (voir scheduler). "
        "Conservé pour variables d’environnement existantes ; non utilisé pour le cron matinal.",
    )
    pipeline_paris_morning_hour: int = Field(
        default=9,
        ge=0,
        le=23,
        description="Heure locale Paris du passage pipeline (lun. week-end + mar.–ven. ouvrés)",
    )
    pipeline_paris_morning_minute: int = Field(
        default=0,
        ge=0,
        le=59,
        description="Minute locale Paris du passage pipeline",
    )
    pipeline_paris_afternoon_hour: int = Field(
        default=18,
        ge=0,
        le=23,
        description="Heure locale Paris du refresh léger 16h (mar.–ven.)",
    )
    pipeline_paris_afternoon_minute: int = Field(
        default=0,
        ge=0,
        le=59,
        description="Minute locale Paris du refresh léger 16h",
    )
    afternoon_refresh_enabled: bool = Field(
        default=True,
        description="Activer le refresh léger 16h : re-collecte + soft-assign clusters nouveaux articles",
    )
    weekend_collect_enabled: bool = Field(
        default=True,
        description="Si true : samedi et dimanche à l’heure Paris du pipeline, collecte seule "
        "(pas de traduction ni post-traitement). Lundi : passage complet inchangé.",
    )
    pipeline_timeout_seconds: int = Field(
        default=10800,
        ge=600,
        le=28800,
        description="Durée max. d’un run pipeline complet (cron ou POST /api/pipeline) avant asyncio timeout ; "
        "variable d’environnement typique : PIPELINE_TIMEOUT_SECONDS (défaut 10800 = 3 h).",
    )
    pipeline_completion_retry_minutes: int = Field(
        default=15,
        ge=0,
        le=120,
        description="Tentatives automatiques de reprise pipeline (resume=True) toutes les N minutes si la collecte "
        "du jour est loguée sans pipeline_summary (ex. timeout). 0 = désactivé. "
        "Variable typique : PIPELINE_COMPLETION_RETRY_MINUTES.",
    )
    pipeline_retry_paris_start_hour: int = Field(
        default=7,
        ge=0,
        le=23,
        description="Heure locale Paris (incluse) : début de la fenêtre des retries auto. de complétion.",
    )
    pipeline_retry_paris_end_hour: int = Field(
        default=16,
        ge=1,
        le=24,
        description="Heure locale Paris (exclusive) : fin de la fenêtre des retries auto. (ex. 16 → jusqu’à 15:59).",
    )
    scheduler_enabled: bool = Field(
        default=True,
        description="Si false, APScheduler n’est pas démarré (réplicas secondaires ou worker HTTP seul).",
    )
    pipeline_lease_ttl_seconds: int = Field(
        default=1800,
        ge=120,
        le=86400,
        description="Durée de validité du lease Postgres ; renouvelée à chaque heartbeat pendant le run.",
    )
    pipeline_heartbeat_interval_seconds: int = Field(
        default=60,
        ge=30,
        le=3600,
        description="Intervalle entre heartbeats lease pendant un pipeline.",
    )
    pipeline_stall_alert_seconds: int = Field(
        default=600,
        ge=120,
        le=7200,
        description="Alerte si heartbeat_at dépasse cet âge (secondes) alors que le lease est encore valide.",
    )
    pipeline_stall_check_interval_minutes: int = Field(
        default=5,
        ge=1,
        le=60,
        description="Fréquence du job « surveillance lease bloqué ».",
    )
    pipeline_step_timeout_collect_s: int = Field(
        default=0,
        ge=0,
        le=28800,
        description="Budget asyncio collecte seule ; 0 = pas de limite propre (repli sur timeout global).",
    )
    pipeline_step_timeout_translate_s: int = Field(
        default=0,
        ge=0,
        le=28800,
        description="Budget asyncio traduction seule ; 0 = pas de limite propre.",
    )
    pipeline_step_timeout_post_s: int = Field(
        default=600,
        ge=0,
        le=28800,
        description="Budget asyncio « post » (relevance → fin, hors collecte/traduction) ; 0 = illimité.",
    )
    translate_progress_log_every_n: int = Field(
        default=25,
        ge=0,
        le=500,
        description="Log pipeline_debug_logs step translate_progress tous les N articles ; 0 = désactivé.",
    )
    max_articles_per_source: int = Field(default=20)
    max_articles_per_general_rss: int = Field(
        default=12,
        ge=1,
        le=200,
        description="Plafond pour flux RSS « général » sans rss_opinion_url (ex. Al Jazeera all.xml)",
    )
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
        default=150,
        ge=25,
        le=500,
        description="Nombre minimum de mots pour accepter un corps d’article (hubs)",
    )
    jina_ai_api_key: str | None = Field(
        default=None,
        description="Cle API Jina AI Reader (r.jina.ai) - fallback geo-bloque",
    )
    jina_ai_fallback_enabled: bool = Field(
        default=True,
        description="Jina AI fallback pour sources jina_ai_primary=true dans overrides",
    )
    nodriver_fallback_enabled: bool = Field(
        default=True,
        description="nodriver fallback Cloudflare apres curl_cffi",
    )
    hub_http_timeout_seconds: float = Field(
        default=55.0,
        ge=15.0,
        le=180.0,
        description="Timeout total aiohttp par URL (hub_fetch robust) ; variable HUB_HTTP_TIMEOUT_SECONDS",
    )
    hub_http_max_attempts: int = Field(
        default=4,
        ge=1,
        le=10,
        description="Tentatives aiohttp avant fallback curl_cffi ; variable HUB_HTTP_MAX_ATTEMPTS",
    )
    hub_curl_timeout_seconds: float = Field(
        default=55.0,
        ge=15.0,
        le=180.0,
        description="Timeout curl_cffi (hub_fetch) ; variable HUB_CURL_TIMEOUT_SECONDS",
    )
    hub_playwright_cf_relaxed_retry: bool = Field(
        default=True,
        description="Si la 1re capture Playwright ressemble à une page Cloudflare challenge, "
        "une 2e tentative avec wait_until=load et délai plus long (hubs + articles)",
    )
    hub_between_strategy_jitter_seconds: float = Field(
        default=0.35,
        ge=0.0,
        le=5.0,
        description="Pause aléatoire uniforme 0..N s entre fin flux RSS et fetch HTML hub (politesse)",
    )
    hub_validation_inter_probe_base_delay_seconds: float = Field(
        default=1.0,
        ge=0.2,
        le=30.0,
        description="Pause de base entre deux hubs en validate_media_hubs",
    )
    hub_validation_inter_probe_jitter_seconds: float = Field(
        default=0.55,
        ge=0.0,
        le=10.0,
        description="Jitter ajouté à la pause entre probes (uniforme 0..jitter + base)",
    )
    hub_wayback_timeout_seconds: float = Field(
        default=12.0,
        ge=3.0,
        le=45.0,
        description="Timeout requête API archive.org wayback/available (diagnostic)",
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
    translation_pipeline_batch_limit: int = Field(
        default=300,
        ge=1,
        le=2000,
        description="Plafond d’articles traduits par passage (après filtre fraîcheur) : coût / durée, pas définition du périmètre",
    )
    translation_min_relevance_deterministic: float | None = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Seuil relevance_score_deterministic minimal pour traduire (optionnel). None = pas de filtre. Ex: 0.05 evite de traduire des articles clairement hors-perimetre.",
    )
    summary_min_words: int = Field(default=150)
    summary_max_words: int = Field(default=200)

    hdbscan_min_cluster_size: int = Field(
        default=3,
        ge=2,
        le=200,
        description="MEMW v2 §4.2 : corpus post-dédup ~80–150 articles",
    )
    hdbscan_min_samples: int = Field(
        default=2,
        ge=1,
        le=50,
        description="MEMW v2 §4.2 (min_samples=2)",
    )
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
        description="UMAP avant HDBSCAN (MEMW v2 : 15 dimensions)",
    )
    umap_n_neighbors: int = Field(default=15, ge=2, le=200)
    umap_n_components: int = Field(default=15, ge=2, le=50)
    umap_min_dist: float = Field(
        default=0.1,
        ge=0.0,
        le=0.99,
        description="MEMW v2 §4.2 (min_dist=0.1)",
    )
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
    embedding_batch_limit: int = Field(
        default=500,
        ge=1,
        le=2000,
        description="Plafond articles par passage embed_pending_articles (file priorisée)",
    )
    embed_revue_registry_only: bool = Field(
        default=False,
        description="Si true : n'embedder que les articles dont media_source_id est dans MEDIA_REVUE_REGISTRY.json",
    )
    embed_prioritize_editorial_order: bool = Field(
        default=True,
        description="Dans le batch, traiter d'abord opinion/editorial/tribune/analysis puis le reste (si embed_only_editorial_types=false)",
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
    usage_event_logging_enabled: bool = Field(
        default=True,
        description="Enregistrer chaque requête API dans usage_events (dashboard analytique)",
    )
    translation_json_repair: bool = Field(
        default=True,
        description="Une 2ᵉ passe LLM si le JSON de traduction est invalide (coût latence + tokens)",
    )
    internal_api_key: str | None = Field(
        default=None,
        description="Si défini, endpoints POST/PUT/PATCH/DELETE sensibles exigent "
        "Authorization: Bearer <INTERNAL_API_KEY>",
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
        description=(
            "Si True : génération revue + passes pipeline (sujets, libellés JSON simples, etc.) "
            "uniquement via Sonnet ; pas de repli Groq/Cerebras. "
            "Si False (recommandé prod.) : même chaîne que `LLMRouter.generate()`."
        ),
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
    cluster_merge_centroid_cosine: float = Field(
        default=0.88,
        ge=0.5,
        le=0.99,
        description="MEMW v2 §4 : fusionner deux clusters si similarité cosinus des centroïdes > seuil ; "
        "0.88 limite les méga-fusions (0.80 trop agressif sur corpus régional). Surcharge : CLUSTER_MERGE_CENTROID_COSINE.",
    )
    semantic_dedup_cosine: float = Field(
        default=0.92,
        ge=0.80,
        le=0.99,
        description="Passe 2 dédup : cosinus sur embeddings (résumé global article)",
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
    article_analysis_enabled: bool = Field(
        default=True,
        description="Pipeline post-traduction : analyse experte (bullets, thèse, faits) via LLM",
    )
    article_analysis_model: str = Field(
        default="openai/gpt-oss-120b",
        description="Modèle pour article_analysis. Groq: openai/gpt-oss-120b (strict JSON, MMLU 90%). Anthropic: claude-*",
    )
    article_analysis_batch_limit: int = Field(
        default=500,
        ge=1,
        le=2000,
        description="Plafond d’articles à analyser par run pipeline",
    )
    article_analysis_fill_interval_minutes: int = Field(
        default=20,
        ge=0,
        le=1440,
        description="Intervalle (min) du job fill autonome (tous articles recents, sans filtre edition). 0=desactive.",
    )
    article_analysis_fill_batch: int = Field(
        default=150,
        ge=1,
        le=1000,
        description="Batch du job fill autonome (hors pipeline principal)",
    )
    article_analysis_fill_hours: int = Field(
        default=72,
        ge=1,
        le=720,
        description="Fenetre temporelle (heures) du job fill",
    )
    article_analysis_max_tokens: int = Field(
        default=8192,
        ge=512,
        le=32000,
        description="Plafond max_tokens pour l’appel tool JSON article_analysis (thinking + 5 puces)",
    )
    selected_article_retention_hours: int = Field(
        default=72,
        ge=24,
        le=720,
        description="TTL rétention (articles sélectionnés sujet du jour) : corps + traduction prioritaire",
    )
    auto_translate_selected_articles: bool = Field(
        default=True,
        description="Si true : déclencher traduction corps complet pour les articles sélectionnés",
    )
    force_full_translation_for_selected: bool = Field(
        default=True,
        description="Si true : ignorer translation_english_summary_only pour les articles en rétention topic_selection",
    )
    selected_full_translation_batch_limit: int = Field(
        default=15,
        ge=1,
        le=80,
        description="Plafond d’articles par tick job traduction corps (sélection)",
    )
    selected_fulltext_job_interval_minutes: int = Field(
        default=5,
        ge=0,
        le=120,
        description="Intervalle job traduction corps sélection ; 0 = désactivé",
    )
    enhanced_scraper_enabled: bool = Field(
        default=True,
        description="Activer la cascade scraping enrichie (hubs)",
    )
    store_full_translation_fr: bool = Field(
        default=True,
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

    @property
    def async_database_url_for_migrations(self) -> str:
        """Alembic uniquement : préfère l’URL publique si définie (CLI local + railway run)."""
        raw = self.database_public_url or self.database_url
        url = raw.strip()
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
