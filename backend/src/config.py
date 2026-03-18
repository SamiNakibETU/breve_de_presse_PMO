from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/press_review",
    )

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
    groq_generation_model: str = Field(default="llama-3.3-70b-versatile")

    # --- Cerebras models (AR/FA/TR/KU translation) ---
    cerebras_translation_model: str = Field(default="qwen-3-235b-a22b")

    collection_hour_utc: int = Field(default=6)
    max_articles_per_source: int = Field(default=20)
    request_delay_seconds: float = Field(default=1.5)
    user_agent: str = Field(
        default="OLJ-PressReview/1.0 (editorial-research; contact@lorientlejour.com)",
    )

    min_article_length: int = Field(default=200)
    translation_confidence_threshold: float = Field(default=0.7)
    summary_min_words: int = Field(default=150)
    summary_max_words: int = Field(default=200)

    port: int = Field(default=8000)
    environment: str = Field(default="development")
    log_level: str = Field(default="INFO")
    frontend_url: str = Field(default="http://localhost:3000")

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
