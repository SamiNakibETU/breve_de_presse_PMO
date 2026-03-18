"""
OLJ Press Review — Configuration
Manages all environment variables and settings.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = Field(
        ..., description="PostgreSQL connection string with pgvector"
    )

    # Anthropic API
    anthropic_api_key: str = Field(..., description="Anthropic API key")
    translation_model: str = Field(
        default="claude-haiku-4-5-20251001",
        description="Model for translation + summarization"
    )
    formatting_model: str = Field(
        default="claude-sonnet-4-5-20241022",
        description="Model for final OLJ format generation"
    )

    # OpenAI (embeddings only)
    openai_api_key: str = Field(default="", description="OpenAI API key for embeddings")
    embedding_model: str = Field(
        default="text-embedding-3-small",
        description="Embedding model for semantic search"
    )

    # Collection settings
    collection_hour_utc: int = Field(
        default=6, description="Hour (UTC) for daily collection cron"
    )
    max_articles_per_source: int = Field(
        default=20, description="Max articles to collect per source per run"
    )
    request_delay_seconds: float = Field(
        default=1.5, description="Delay between requests to same domain"
    )
    user_agent: str = Field(
        default="OLJ-PressReview/1.0 (editorial-research; contact@lorientlejour.com)",
        description="User-Agent header for ethical scraping"
    )

    # Processing
    min_article_length: int = Field(
        default=200, description="Minimum article length in characters to process"
    )
    translation_confidence_threshold: float = Field(
        default=0.7, description="Below this, flag for human review"
    )
    summary_min_words: int = Field(default=150)
    summary_max_words: int = Field(default=200)

    # Railway / Infrastructure
    port: int = Field(default=8000, description="FastAPI port")
    environment: str = Field(default="development", description="development/staging/production")
    log_level: str = Field(default="INFO")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
