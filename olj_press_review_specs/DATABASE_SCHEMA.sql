-- =================================================================
-- OLJ PRESS REVIEW — DATABASE SCHEMA
-- PostgreSQL 16+ with pgvector extension
-- =================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- For text search
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================
-- MEDIA SOURCES
-- =================================================================
CREATE TABLE media_sources (
    id VARCHAR(50) PRIMARY KEY,          -- e.g. 'lb_olj', 'il_haaretz_en'
    name VARCHAR(255) NOT NULL,
    country VARCHAR(100) NOT NULL,
    country_code CHAR(2) NOT NULL,
    tier SMALLINT NOT NULL CHECK (tier IN (1, 2)),
    languages TEXT[] NOT NULL,            -- e.g. {'ar', 'en', 'fr'}
    editorial_line TEXT,
    bias VARCHAR(50),                     -- e.g. 'pro-government', 'liberal-independent'
    content_types TEXT[],                 -- e.g. {'news', 'opinions', 'analyses'}
    url VARCHAR(500) NOT NULL,
    rss_url VARCHAR(500),
    english_version_url VARCHAR(500),
    collection_method VARCHAR(20) NOT NULL DEFAULT 'rss' CHECK (collection_method IN ('rss', 'scraping', 'api')),
    paywall VARCHAR(20) DEFAULT 'free' CHECK (paywall IN ('free', 'soft', 'hard')),
    translation_quality VARCHAR(20) DEFAULT 'high' CHECK (translation_quality IN ('native', 'high', 'medium', 'low')),
    editorial_notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_collected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE media_sources IS 'Registry of 48 MENA media sources with editorial metadata';
COMMENT ON COLUMN media_sources.bias IS 'Known editorial bias: pro-government, opposition, liberal-independent, etc.';
COMMENT ON COLUMN media_sources.tier IS '1 = priority sources, 2 = secondary sources';

-- =================================================================
-- ARTICLES (raw + processed)
-- =================================================================
CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_source_id VARCHAR(50) NOT NULL REFERENCES media_sources(id),
    
    -- Original content
    url VARCHAR(2000) NOT NULL UNIQUE,
    url_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 for fast dedup
    title_original TEXT NOT NULL,
    content_original TEXT,
    author VARCHAR(500),
    published_at TIMESTAMPTZ,
    source_language VARCHAR(10),           -- ISO 639-1: ar, en, he, fa, tr, fr, ku
    
    -- Processed content (French)
    title_fr TEXT,
    thesis_summary_fr TEXT,                -- One-sentence thesis
    summary_fr TEXT,                        -- 150-200 word summary
    key_quotes_fr TEXT[],                   -- Translated key quotes
    
    -- Classification
    article_type VARCHAR(30) CHECK (article_type IN (
        'opinion', 'editorial', 'tribune', 'analysis', 'news', 'interview', 'reportage', 'other'
    )),
    
    -- Quality & confidence
    translation_confidence REAL CHECK (translation_confidence BETWEEN 0 AND 1),
    translation_notes TEXT,
    
    -- OLJ formatted output
    olj_formatted_block TEXT,              -- Final copy-paste ready block
    
    -- Processing status
    status VARCHAR(20) NOT NULL DEFAULT 'raw' CHECK (status IN (
        'raw', 'collected', 'processing', 'translated', 'formatted', 'selected', 'published', 'error'
    )),
    processing_error TEXT,
    
    -- Metadata
    word_count INTEGER,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_articles_media_source ON articles(media_source_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX idx_articles_collected_at ON articles(collected_at DESC);
CREATE INDEX idx_articles_source_language ON articles(source_language);
CREATE INDEX idx_articles_article_type ON articles(article_type);
CREATE INDEX idx_articles_url_hash ON articles(url_hash);

COMMENT ON TABLE articles IS 'All collected articles with original and translated content';
COMMENT ON COLUMN articles.olj_formatted_block IS 'Ready to copy-paste block in OLJ format';

-- =================================================================
-- ARTICLE EMBEDDINGS (pgvector)
-- =================================================================
CREATE TABLE article_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    embedding vector(1536) NOT NULL,       -- text-embedding-3-small dimensions
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
    text_chunk TEXT NOT NULL,               -- The text that was embedded
    chunk_index SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embeddings_article ON article_embeddings(article_id);
-- HNSW index for fast cosine similarity search
CREATE INDEX idx_embeddings_vector ON article_embeddings 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMENT ON TABLE article_embeddings IS 'Vector embeddings for semantic search across articles';

-- =================================================================
-- NAMED ENTITIES
-- =================================================================
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(500) NOT NULL,
    name_fr VARCHAR(500),                  -- French normalized name
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN (
        'PERSON', 'ORG', 'GPE', 'EVENT', 'WEAPON_SYSTEM', 'TREATY', 'OTHER'
    )),
    description TEXT,
    wikidata_id VARCHAR(50),               -- For future linking
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mention_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, entity_type)
);

CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_name_trgm ON entities USING gin(name gin_trgm_ops);

COMMENT ON TABLE entities IS 'Named entities extracted from articles (persons, orgs, places, events)';

-- =================================================================
-- ARTICLE <-> ENTITY JUNCTION
-- =================================================================
CREATE TABLE article_entities (
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    context TEXT,                           -- Sentence where entity appears
    sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    PRIMARY KEY (article_id, entity_id)
);

CREATE INDEX idx_article_entities_entity ON article_entities(entity_id);

-- =================================================================
-- PRESS REVIEWS (daily output)
-- =================================================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500),                    -- e.g. "Revue de presse régionale — 18 mars 2026"
    review_date DATE NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'ready', 'published'
    )),
    full_text TEXT,                         -- Complete review ready for CMS
    journalist_notes TEXT,
    created_by VARCHAR(255),               -- Journalist who compiled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);

CREATE INDEX idx_reviews_date ON reviews(review_date DESC);

-- =================================================================
-- REVIEW ITEMS (articles selected for a review)
-- =================================================================
CREATE TABLE review_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id),
    display_order SMALLINT NOT NULL,
    journalist_edits TEXT,                 -- Any manual edits
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(review_id, article_id)
);

CREATE INDEX idx_review_items_review ON review_items(review_id);

-- =================================================================
-- COLLECTION LOGS (for monitoring)
-- =================================================================
CREATE TABLE collection_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    media_source_id VARCHAR(50) REFERENCES media_sources(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    articles_found INTEGER DEFAULT 0,
    articles_new INTEGER DEFAULT 0,
    articles_error INTEGER DEFAULT 0,
    error_message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN (
        'running', 'completed', 'error'
    ))
);

CREATE INDEX idx_collection_logs_source ON collection_logs(media_source_id);
CREATE INDEX idx_collection_logs_started ON collection_logs(started_at DESC);

-- =================================================================
-- HELPER FUNCTIONS
-- =================================================================

-- Semantic search function
CREATE OR REPLACE FUNCTION search_similar_articles(
    query_embedding vector(1536),
    match_count INTEGER DEFAULT 5,
    similarity_threshold REAL DEFAULT 0.7
)
RETURNS TABLE (
    article_id UUID,
    title_fr TEXT,
    summary_fr TEXT,
    media_name VARCHAR(255),
    similarity REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.title_fr,
        a.summary_fr,
        ms.name,
        1 - (ae.embedding <=> query_embedding) AS similarity
    FROM article_embeddings ae
    JOIN articles a ON ae.article_id = a.id
    JOIN media_sources ms ON a.media_source_id = ms.id
    WHERE 1 - (ae.embedding <=> query_embedding) > similarity_threshold
    ORDER BY ae.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_media_sources_updated 
    BEFORE UPDATE ON media_sources 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_articles_updated 
    BEFORE UPDATE ON articles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =================================================================
-- SEED DATA: Insert media sources from registry
-- =================================================================
-- (Run MEDIA_REGISTRY.json import script — see src/scripts/seed_media.py)
