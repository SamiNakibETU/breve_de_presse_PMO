# Middle East Media Watch v2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformer le système actuel en un Media Watch intelligent avec 36 sources, embeddings sémantiques, clustering thématique et interface journaliste par clusters.

**Architecture:** Pipeline enrichie : collecte RSS (36 sources) → traduction LLM → embedding Cohere API → clustering HDBSCAN → labelling LLM → API clusters → frontend thématique. Tout tourne sur Railway (API uniquement, pas de GPU).

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, PostgreSQL 16 + pgvector, Cohere API, HDBSCAN, Next.js 14, React 19, TypeScript, Tailwind CSS.

---

## Task 1: Créer la branche v2/media-watch

**Files:**
- Aucun fichier à modifier

**Step 1: Créer la branche**

```bash
cd d:\Users\Proprietaire\Desktop\OLJ\Projet_guerre
git checkout -b v2/media-watch
```

**Step 2: Vérifier**

Run: `git branch --show-current`
Expected: `v2/media-watch`

**Step 3: Push la branche**

```bash
git push -u origin v2/media-watch
```

---

## Task 2: Refondre le registre des sources (36 sources)

**Files:**
- Modify: `backend/data/MEDIA_REGISTRY.json`
- Modify: `backend/src/scripts/seed_media.py` (si nécessaire)

**Step 1: Réécrire MEDIA_REGISTRY.json**

Remplacer les 48 sources actuelles par les 36 sources validées dans le design (voir `docs/plans/2026-03-18-media-watch-v2-design.md` section 1). Chaque entrée doit contenir :

```json
{
  "id": "lb_annahar",
  "name": "Annahar",
  "country": "Liban",
  "country_code": "LB",
  "tier": 1,
  "languages": ["ar"],
  "editorial_line": "Journal libanais historique, ligne modérée pro-souveraineté",
  "bias": "centrist",
  "content_types": ["opinions", "editorials", "analysis"],
  "url": "https://www.annahar.com",
  "rss_url": "https://www.annahar.com/rss",
  "rss_opinion_url": null,
  "english_version_url": null,
  "collection_method": "rss",
  "paywall": "free",
  "scraping_difficulty": "easy",
  "translation_quality_to_fr": "direct",
  "editorial_notes": "RSS complet avec content:encoded. Filtrer par catégorie opinion.",
  "is_active": true
}
```

Inclure les 36 sources listées dans le design, plus les 3 sources transversales (Al-Monitor, Middle East Eye, New Lines Magazine). Total : 39 sources.

Pour chaque source, utiliser les URLs RSS validées dans l'analyse technique :
- Jerusalem Post opinion : `https://www.jpost.com/rss/rssfeedsopinion.aspx`
- Daily Sabah opinion : `https://www.dailysabah.com/rss/opinion/op-ed`
- Gulf Times opinion : `https://www.gulf-times.com/rssFeed/4`
- Kuwait Times opinion : `https://kuwaittimes.com/rssFeed/13`
- Arab Times opinion : `https://www.arabtimesonline.com/rssFeed/75/`
- Daily News Egypt opinion : `https://dailynewsegypt.com/category/opinion/feed/`
- Hurriyet Daily News opinion : `https://www.hurriyetdailynews.com/rss/opinion`
- Annahar : `https://www.annahar.com/rss`
- Press TV : `https://www.presstv.ir/rss/rss-125.xml`
- Asharq Al-Awsat : `https://english.aawsat.com/feed`
- Syrian Observer : `https://syrianobserver.com/feed`
- Enab Baladi : `https://english.enabbaladi.net/feed/`
- SANA : `https://sana.sy/en/feed/`
- Iraqi News : `https://www.iraqinews.com/feed/`
- Mada Masr : `https://www.madamasr.com/en/feed/`
- Gulf News : `https://gulfnews.com/feed`
- Haaretz opinion : `https://www.haaretz.com/srv/opinion-rss`
- Tehran Times : `https://www.tehrantimes.com/rss`

Pour les sources sans RSS (The National, Saudi Gazette, Peninsula Qatar, Rudaw, Iran International, Al Jazeera, etc.), mettre `collection_method: "scraping"` et documenter l'URL de la section opinion dans `editorial_notes`.

Pour les sources Hard (OLJ, Al Akhbar, Arab News, Khaleej Times SPA, Jordan Times SPA, Al Ghad, Roya News, KUNA), mettre `is_active: false` et `editorial_notes: "Phase v3 - nécessite Playwright headless"`.

**Step 2: Vérifier la cohérence**

Compter les sources : 39 entrées attendues. Vérifier que chaque pays a au moins 3 sources.

**Step 3: Commit**

```bash
git add backend/data/MEDIA_REGISTRY.json
git commit -m "feat: refonte registre sources - 39 sources, 12 pays, RSS validés"
```

---

## Task 3: Ajouter les dépendances Python

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Ajouter les nouvelles dépendances**

Ajouter à `backend/requirements.txt` :

```
cohere>=5.0
hdbscan>=0.8.33
scikit-learn>=1.4
numpy>=1.26
```

**Step 2: Installer**

```bash
cd backend
pip install -r requirements.txt
```

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat: ajouter dépendances cohere, hdbscan, scikit-learn"
```

---

## Task 4: Modèle de données TopicCluster + migration pgvector

**Files:**
- Create: `backend/src/models/cluster.py`
- Modify: `backend/src/models/__init__.py`
- Modify: `backend/src/models/article.py` (ajouter colonne embedding + cluster_id)
- Modify: `backend/src/config.py` (ajouter COHERE_API_KEY)

**Step 1: Créer le modèle TopicCluster**

```python
# backend/src/models/cluster.py
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid

from src.database import Base


class TopicCluster(Base):
    __tablename__ = "topic_clusters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    label = Column(String(300))
    article_count = Column(Integer, default=0)
    country_count = Column(Integer, default=0)
    avg_relevance = Column(Float, default=0.0)
    latest_article_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    articles = relationship("Article", back_populates="cluster")
```

**Step 2: Modifier le modèle Article**

Ajouter à `backend/src/models/article.py` :

```python
from pgvector.sqlalchemy import Vector
from sqlalchemy import ForeignKey
from sqlalchemy.orm import relationship

# Dans la classe Article, ajouter :
embedding = Column(Vector(1024), nullable=True)
cluster_id = Column(UUID(as_uuid=True), ForeignKey("topic_clusters.id"), nullable=True)

cluster = relationship("TopicCluster", back_populates="articles")
```

**Step 3: Ajouter COHERE_API_KEY dans config**

Dans `backend/src/config.py`, ajouter :

```python
cohere_api_key: str | None = None
```

**Step 4: Mettre à jour __init__.py**

```python
from src.models.cluster import TopicCluster
```

**Step 5: Générer et appliquer la migration Alembic**

```bash
cd backend
alembic revision --autogenerate -m "add topic_clusters table and article embedding column"
alembic upgrade head
```

**Step 6: Commit**

```bash
git add backend/src/models/ backend/src/config.py backend/alembic/
git commit -m "feat: modèle TopicCluster + colonne embedding sur Article"
```

---

## Task 5: Service d'embedding (Cohere API)

**Files:**
- Create: `backend/src/services/embedding_service.py`
- Create: `backend/tests/test_embedding_service.py`

**Step 1: Écrire le test**

```python
# backend/tests/test_embedding_service.py
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_embed_texts_returns_vectors():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.1] * 1024, [0.2] * 1024]
    mock_client.embed = MagicMock(return_value=mock_response)

    with patch("src.services.embedding_service.cohere.ClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService
        service = EmbeddingService()
        vectors = service.embed_texts(["test article 1", "test article 2"])
        assert len(vectors) == 2
        assert len(vectors[0]) == 1024


@pytest.mark.asyncio
async def test_embed_texts_batches_large_input():
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.embeddings.float_ = [[0.1] * 1024] * 96
    mock_client.embed = MagicMock(return_value=mock_response)

    with patch("src.services.embedding_service.cohere.ClientV2", return_value=mock_client):
        from src.services.embedding_service import EmbeddingService
        service = EmbeddingService()
        texts = [f"article {i}" for i in range(200)]
        vectors = service.embed_texts(texts)
        assert mock_client.embed.call_count >= 3  # 200/96 = 3 batches
```

**Step 2: Vérifier que le test échoue**

```bash
pytest backend/tests/test_embedding_service.py -v
```

**Step 3: Implémenter le service**

```python
# backend/src/services/embedding_service.py
import cohere
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.models.article import Article

logger = structlog.get_logger()

BATCH_SIZE = 96  # Cohere max batch size
MODEL = "embed-multilingual-v3.0"
INPUT_TYPE = "search_document"


class EmbeddingService:
    def __init__(self):
        settings = get_settings()
        if not settings.cohere_api_key:
            raise ValueError("COHERE_API_KEY is required for embedding service")
        self.client = cohere.ClientV2(api_key=settings.cohere_api_key)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        all_embeddings = []
        for i in range(0, len(texts), BATCH_SIZE):
            batch = texts[i:i + BATCH_SIZE]
            response = self.client.embed(
                texts=batch,
                model=MODEL,
                input_type=INPUT_TYPE,
                embedding_types=["float"],
            )
            all_embeddings.extend(response.embeddings.float_)
        return all_embeddings

    async def embed_pending_articles(self, db: AsyncSession) -> int:
        stmt = (
            select(Article)
            .where(Article.status == "translated")
            .where(Article.summary_fr.isnot(None))
            .where(Article.embedding.is_(None))
            .limit(500)
        )
        result = await db.execute(stmt)
        articles = result.scalars().all()

        if not articles:
            return 0

        texts = [
            f"{a.title_fr or ''} {a.summary_fr or ''}"
            for a in articles
        ]

        embeddings = self.embed_texts(texts)

        for article, embedding in zip(articles, embeddings):
            article.embedding = embedding

        await db.commit()
        logger.info("embedded_articles", count=len(articles))
        return len(articles)
```

**Step 4: Vérifier que les tests passent**

```bash
pytest backend/tests/test_embedding_service.py -v
```

**Step 5: Commit**

```bash
git add backend/src/services/embedding_service.py backend/tests/test_embedding_service.py
git commit -m "feat: service d'embedding Cohere pour articles traduits"
```

---

## Task 6: Service de clustering (HDBSCAN)

**Files:**
- Create: `backend/src/services/clustering_service.py`
- Create: `backend/tests/test_clustering_service.py`

**Step 1: Écrire le test**

```python
# backend/tests/test_clustering_service.py
import pytest
import numpy as np
from unittest.mock import AsyncMock, MagicMock, patch


def test_cluster_embeddings_groups_similar():
    from src.services.clustering_service import ClusteringService
    service = ClusteringService()

    # 3 groupes de vecteurs similaires
    group1 = [np.random.randn(1024) + np.array([10] * 1024) for _ in range(5)]
    group2 = [np.random.randn(1024) + np.array([-10] * 1024) for _ in range(5)]
    group3 = [np.random.randn(1024) + np.array([0] * 1024) for _ in range(5)]
    embeddings = group1 + group2 + group3

    labels = service.cluster_embeddings(embeddings)
    assert len(labels) == 15
    # Les 5 premiers devraient avoir le même label
    assert len(set(labels[:5])) == 1
    assert len(set(labels[5:10])) == 1


def test_cluster_embeddings_handles_noise():
    from src.services.clustering_service import ClusteringService
    service = ClusteringService()

    # Très peu d'articles → tout est noise
    embeddings = [np.random.randn(1024) for _ in range(2)]
    labels = service.cluster_embeddings(embeddings)
    assert len(labels) == 2
    assert all(l == -1 for l in labels)
```

**Step 2: Implémenter le service**

```python
# backend/src/services/clustering_service.py
import numpy as np
import hdbscan
import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4

from src.models.article import Article
from src.models.cluster import TopicCluster

logger = structlog.get_logger()


class ClusteringService:
    def __init__(self, min_cluster_size: int = 3, min_samples: int = 2):
        self.min_cluster_size = min_cluster_size
        self.min_samples = min_samples

    def cluster_embeddings(self, embeddings: list[list[float]]) -> list[int]:
        if len(embeddings) < self.min_cluster_size:
            return [-1] * len(embeddings)

        X = np.array(embeddings)
        # Normaliser pour cosine similarity
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        norms[norms == 0] = 1
        X_norm = X / norms

        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=self.min_cluster_size,
            min_samples=self.min_samples,
            metric="euclidean",
            cluster_selection_method="eom",
        )
        labels = clusterer.fit_predict(X_norm)
        return labels.tolist()

    async def run_clustering(self, db: AsyncSession) -> dict:
        # Récupérer tous les articles avec embedding des dernières 72h
        from datetime import datetime, timedelta, timezone
        cutoff = datetime.now(timezone.utc) - timedelta(hours=72)

        stmt = (
            select(Article)
            .where(Article.embedding.isnot(None))
            .where(Article.created_at >= cutoff)
        )
        result = await db.execute(stmt)
        articles = result.scalars().all()

        if len(articles) < self.min_cluster_size:
            return {"clusters_created": 0, "articles_clustered": 0}

        embeddings = [a.embedding for a in articles]
        labels = self.cluster_embeddings(embeddings)

        # Réinitialiser les anciens clusters
        await db.execute(
            update(Article).where(Article.cluster_id.isnot(None)).values(cluster_id=None)
        )
        await db.execute(
            update(TopicCluster).values(is_active=False)
        )

        # Créer les nouveaux clusters
        unique_labels = set(l for l in labels if l != -1)
        cluster_map = {}

        for label in unique_labels:
            cluster_articles = [a for a, l in zip(articles, labels) if l == label]
            countries = set(a.media_source.country for a in cluster_articles if a.media_source)

            cluster = TopicCluster(
                id=uuid4(),
                label=None,  # Sera rempli par le labelling LLM
                article_count=len(cluster_articles),
                country_count=len(countries),
                latest_article_at=max(a.published_at or a.created_at for a in cluster_articles),
                is_active=True,
            )
            db.add(cluster)
            cluster_map[label] = cluster

            for article in cluster_articles:
                article.cluster_id = cluster.id

        await db.commit()

        logger.info(
            "clustering_complete",
            total_articles=len(articles),
            clusters_created=len(unique_labels),
            noise_articles=labels.count(-1),
        )

        return {
            "clusters_created": len(unique_labels),
            "articles_clustered": len(articles) - labels.count(-1),
            "noise_articles": labels.count(-1),
        }
```

**Step 3: Vérifier les tests**

```bash
pytest backend/tests/test_clustering_service.py -v
```

**Step 4: Commit**

```bash
git add backend/src/services/clustering_service.py backend/tests/test_clustering_service.py
git commit -m "feat: service de clustering HDBSCAN pour groupement thématique"
```

---

## Task 7: Service de labelling de clusters (LLM)

**Files:**
- Create: `backend/src/services/cluster_labeller.py`

**Step 1: Implémenter le labelling**

```python
# backend/src/services/cluster_labeller.py
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.cluster import TopicCluster
from src.models.article import Article
from src.services.llm_router import get_llm_router

logger = structlog.get_logger()

LABEL_PROMPT = """Tu es un éditeur de presse. Voici les titres de plusieurs articles sur le même sujet :

{titles}

Génère un label de 5 à 10 mots maximum qui décrit le thème commun de ces articles.
Le label doit être en français, factuel et descriptif (pas de verbe conjugué).
Réponds UNIQUEMENT avec le label, rien d'autre."""


async def label_clusters(db: AsyncSession) -> int:
    router = get_llm_router()

    stmt = (
        select(TopicCluster)
        .where(TopicCluster.is_active == True)
        .where(TopicCluster.label.is_(None))
    )
    result = await db.execute(stmt)
    clusters = result.scalars().all()

    labeled = 0
    for cluster in clusters:
        articles_stmt = (
            select(Article)
            .where(Article.cluster_id == cluster.id)
            .limit(5)
        )
        articles_result = await db.execute(articles_stmt)
        articles = articles_result.scalars().all()

        titles = "\n".join(
            f"- {a.title_fr or a.title_original}"
            for a in articles
            if a.title_fr or a.title_original
        )

        if not titles:
            continue

        try:
            label = await router.generate(
                prompt=LABEL_PROMPT.format(titles=titles),
                system="Tu es un éditeur de presse spécialisé Moyen-Orient.",
                language="fr",
            )
            cluster.label = label.strip().strip('"').strip("«").strip("»").strip()[:300]
            labeled += 1
        except Exception as e:
            logger.warning("cluster_label_failed", cluster_id=str(cluster.id), error=str(e))

    await db.commit()
    logger.info("clusters_labeled", count=labeled)
    return labeled
```

**Step 2: Commit**

```bash
git add backend/src/services/cluster_labeller.py
git commit -m "feat: labelling automatique des clusters par LLM"
```

---

## Task 8: API endpoints clusters

**Files:**
- Create: `backend/src/routers/clusters.py`
- Create: `backend/src/schemas/clusters.py`
- Modify: `backend/src/app.py` (inclure le router)

**Step 1: Créer les schemas**

```python
# backend/src/schemas/clusters.py
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID


class ClusterResponse(BaseModel):
    id: UUID
    label: str | None
    article_count: int
    country_count: int
    avg_relevance: float
    latest_article_at: datetime | None
    is_active: bool
    countries: list[str] = []

    class Config:
        from_attributes = True


class ClusterListResponse(BaseModel):
    clusters: list[ClusterResponse]
    total: int
    noise_count: int


class ClusterRefreshResponse(BaseModel):
    clusters_created: int
    articles_clustered: int
    articles_embedded: int
    clusters_labeled: int
```

**Step 2: Créer le router**

```python
# backend/src/routers/clusters.py
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.database import get_db
from src.models.cluster import TopicCluster
from src.models.article import Article
from src.models.media_source import MediaSource
from src.schemas.clusters import ClusterResponse, ClusterListResponse, ClusterRefreshResponse
from src.services.embedding_service import EmbeddingService
from src.services.clustering_service import ClusteringService
from src.services.cluster_labeller import label_clusters

router = APIRouter(prefix="/api/clusters", tags=["clusters"])


@router.get("", response_model=ClusterListResponse)
async def list_clusters(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(TopicCluster)
        .where(TopicCluster.is_active == True)
        .order_by(TopicCluster.avg_relevance.desc())
    )
    result = await db.execute(stmt)
    clusters = result.scalars().all()

    cluster_responses = []
    for cluster in clusters:
        articles_stmt = (
            select(Article)
            .options(selectinload(Article.media_source))
            .where(Article.cluster_id == cluster.id)
        )
        articles_result = await db.execute(articles_stmt)
        articles = articles_result.scalars().all()
        countries = list(set(
            a.media_source.country for a in articles
            if a.media_source and a.media_source.country
        ))

        cluster_responses.append(ClusterResponse(
            id=cluster.id,
            label=cluster.label,
            article_count=cluster.article_count,
            country_count=cluster.country_count,
            avg_relevance=cluster.avg_relevance,
            latest_article_at=cluster.latest_article_at,
            is_active=cluster.is_active,
            countries=countries,
        ))

    noise_stmt = select(func.count()).where(
        Article.embedding.isnot(None),
        Article.cluster_id.is_(None),
    )
    noise_result = await db.execute(noise_stmt)
    noise_count = noise_result.scalar() or 0

    return ClusterListResponse(
        clusters=cluster_responses,
        total=len(cluster_responses),
        noise_count=noise_count,
    )


@router.get("/{cluster_id}/articles")
async def get_cluster_articles(
    cluster_id: str,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Article)
        .options(selectinload(Article.media_source))
        .where(Article.cluster_id == cluster_id)
        .order_by(Article.published_at.desc())
    )
    result = await db.execute(stmt)
    articles = result.scalars().all()

    # Grouper par pays
    by_country = {}
    for article in articles:
        country = article.media_source.country if article.media_source else "Inconnu"
        if country not in by_country:
            by_country[country] = []
        by_country[country].append(article)

    return {
        "cluster_id": cluster_id,
        "articles_by_country": {
            country: [
                {
                    "id": str(a.id),
                    "title_fr": a.title_fr,
                    "title_original": a.title_original,
                    "summary_fr": a.summary_fr,
                    "source_name": a.media_source.name if a.media_source else None,
                    "country": country,
                    "published_at": a.published_at.isoformat() if a.published_at else None,
                    "article_type": a.article_type,
                    "author": a.author,
                    "url": a.url,
                    "source_language": a.source_language,
                    "translation_confidence": a.translation_confidence,
                }
                for a in articles_list
            ]
            for country, articles_list in by_country.items()
        },
        "total_articles": len(articles),
        "countries": list(by_country.keys()),
    }


@router.post("/refresh", response_model=ClusterRefreshResponse)
async def refresh_clusters(db: AsyncSession = Depends(get_db)):
    embedding_service = EmbeddingService()
    clustering_service = ClusteringService()

    embedded = await embedding_service.embed_pending_articles(db)
    clustering_result = await clustering_service.run_clustering(db)
    labeled = await label_clusters(db)

    return ClusterRefreshResponse(
        clusters_created=clustering_result["clusters_created"],
        articles_clustered=clustering_result["articles_clustered"],
        articles_embedded=embedded,
        clusters_labeled=labeled,
    )
```

**Step 3: Enregistrer le router dans app.py**

Dans `backend/src/app.py`, ajouter :

```python
from src.routers.clusters import router as clusters_router
app.include_router(clusters_router)
```

**Step 4: Commit**

```bash
git add backend/src/routers/clusters.py backend/src/schemas/clusters.py backend/src/app.py
git commit -m "feat: API endpoints /api/clusters avec groupement par pays"
```

---

## Task 9: Intégrer le clustering dans le pipeline automatique

**Files:**
- Modify: `backend/src/routers/pipeline.py`
- Modify: `backend/src/services/scheduler.py` (si le scheduler lance le pipeline)

**Step 1: Ajouter l'étape embedding+clustering au pipeline**

Dans `backend/src/routers/pipeline.py`, modifier l'endpoint `/api/pipeline` pour ajouter les étapes embedding et clustering après la traduction :

```python
# Après la traduction, ajouter :
try:
    from src.services.embedding_service import EmbeddingService
    from src.services.clustering_service import ClusteringService
    from src.services.cluster_labeller import label_clusters

    embedding_service = EmbeddingService()
    embedded = await embedding_service.embed_pending_articles(db)

    clustering_service = ClusteringService()
    clustering_result = await clustering_service.run_clustering(db)

    labeled = await label_clusters(db)

    pipeline_result["embedding"] = {"embedded": embedded}
    pipeline_result["clustering"] = clustering_result
    pipeline_result["labelling"] = {"labeled": labeled}
except Exception as e:
    logger.warning("embedding_clustering_skipped", error=str(e))
    pipeline_result["embedding"] = {"error": str(e)}
```

**Step 2: Commit**

```bash
git add backend/src/routers/pipeline.py
git commit -m "feat: intégrer embedding + clustering dans le pipeline automatique"
```

---

## Task 10: Frontend — Types et API client clusters

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Ajouter les types**

Dans `frontend/src/lib/types.ts` :

```typescript
export interface TopicCluster {
  id: string;
  label: string | null;
  article_count: number;
  country_count: number;
  avg_relevance: number;
  latest_article_at: string | null;
  is_active: boolean;
  countries: string[];
}

export interface ClusterListResponse {
  clusters: TopicCluster[];
  total: number;
  noise_count: number;
}

export interface ClusterArticlesResponse {
  cluster_id: string;
  articles_by_country: Record<string, Article[]>;
  total_articles: number;
  countries: string[];
}

export interface ClusterRefreshResponse {
  clusters_created: number;
  articles_clustered: number;
  articles_embedded: number;
  clusters_labeled: number;
}
```

**Step 2: Ajouter les fonctions API**

Dans `frontend/src/lib/api.ts` :

```typescript
export async function getClusters(): Promise<ClusterListResponse> {
  const res = await fetch(`${API_URL}/api/clusters`);
  if (!res.ok) throw new Error("Failed to fetch clusters");
  return res.json();
}

export async function getClusterArticles(clusterId: string): Promise<ClusterArticlesResponse> {
  const res = await fetch(`${API_URL}/api/clusters/${clusterId}/articles`);
  if (!res.ok) throw new Error("Failed to fetch cluster articles");
  return res.json();
}

export async function refreshClusters(): Promise<ClusterRefreshResponse> {
  const res = await fetch(`${API_URL}/api/clusters/refresh`, { method: "POST" });
  if (!res.ok) throw new Error("Failed to refresh clusters");
  return res.json();
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/lib/api.ts
git commit -m "feat: types et API client pour clusters frontend"
```

---

## Task 11: Frontend — Page Dashboard thématique

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Create: `frontend/src/components/clusters/cluster-card.tsx`
- Create: `frontend/src/components/clusters/cluster-list.tsx`

**Step 1: Créer ClusterCard**

```typescript
// frontend/src/components/clusters/cluster-card.tsx
"use client";

import Link from "next/link";
import { TopicCluster } from "@/lib/types";

const COUNTRY_FLAGS: Record<string, string> = {
  "Liban": "🇱🇧", "Israël": "🇮🇱", "Iran": "🇮🇷",
  "EAU": "🇦🇪", "Arabie Saoudite": "🇸🇦", "Turquie": "🇹🇷",
  "Irak": "🇮🇶", "Syrie": "🇸🇾", "Qatar": "🇶🇦",
  "Koweït": "🇰🇼", "Jordanie": "🇯🇴", "Égypte": "🇪🇬",
  "États-Unis": "🇺🇸", "Royaume-Uni": "🇬🇧", "France": "🇫🇷",
};

export function ClusterCard({ cluster }: { cluster: TopicCluster }) {
  return (
    <Link href={`/clusters/${cluster.id}`}>
      <article className="border-b border-[#e5e5e5] py-6 hover:bg-[#fafafa] transition-colors px-4 -mx-4">
        <h2 className="font-serif text-xl mb-2">
          {cluster.label || "Cluster sans label"}
        </h2>
        <p className="text-sm text-[#666] mb-3">
          {cluster.article_count} articles · {cluster.country_count} pays · pertinence {Math.round(cluster.avg_relevance)}
        </p>
        <div className="flex gap-2 flex-wrap">
          {cluster.countries.map((country) => (
            <span key={country} className="text-sm">
              {COUNTRY_FLAGS[country] || ""} {country}
            </span>
          ))}
        </div>
      </article>
    </Link>
  );
}
```

**Step 2: Créer ClusterList**

```typescript
// frontend/src/components/clusters/cluster-list.tsx
"use client";

import { TopicCluster } from "@/lib/types";
import { ClusterCard } from "./cluster-card";

interface ClusterListProps {
  clusters: TopicCluster[];
  noiseCount: number;
}

export function ClusterList({ clusters, noiseCount }: ClusterListProps) {
  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 text-[#999]">
        <p className="font-serif text-lg">Aucun cluster thématique détecté</p>
        <p className="text-sm mt-2">Lancez le pipeline pour collecter et analyser les articles</p>
      </div>
    );
  }

  return (
    <div>
      {clusters.map((cluster) => (
        <ClusterCard key={cluster.id} cluster={cluster} />
      ))}
      {noiseCount > 0 && (
        <div className="py-4 text-sm text-[#999]">
          + {noiseCount} articles non classés
        </div>
      )}
    </div>
  );
}
```

**Step 3: Modifier le Dashboard (page.tsx)**

Refondre `frontend/src/app/page.tsx` pour afficher les clusters en premier, avec les stats en dessous. Le dashboard doit montrer :
1. Titre avec date du jour et nombre de sujets
2. Boutons pipeline (collecte, traduction, refresh clusters)
3. Liste des clusters
4. Stats résumées en bas

**Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/clusters/
git commit -m "feat: dashboard thématique avec clusters"
```

---

## Task 12: Frontend — Page détail cluster

**Files:**
- Create: `frontend/src/app/clusters/[id]/page.tsx`

**Step 1: Créer la page cluster**

La page doit :
1. Fetcher les articles du cluster groupés par pays
2. Afficher le label du cluster en titre
3. Pour chaque pays, une section avec les articles
4. Checkbox de sélection par article
5. Panier flottant en bas avec compteur et bouton "Générer la revue"
6. Chaque article montre : titre FR, source, date, type, résumé preview (2-3 lignes)

L'utilisateur doit pouvoir sélectionner des articles puis être redirigé vers `/review` avec les IDs sélectionnés.

**Step 2: Commit**

```bash
git add frontend/src/app/clusters/
git commit -m "feat: page détail cluster avec vue par pays et sélection"
```

---

## Task 13: Mettre à jour la navigation

**Files:**
- Modify: `frontend/src/components/layout/sidebar.tsx` (ou masthead)

**Step 1: Ajouter le lien clusters**

Ajouter un lien "Sujets" ou "Clusters" dans la navigation, pointant vers `/` (dashboard thématique).

La navigation finale :
- Dashboard (/) — vue clusters thématiques
- Articles (/articles) — vue plate avec filtres
- Revue de presse (/review) — génération et historique

**Step 2: Commit**

```bash
git add frontend/src/components/layout/
git commit -m "feat: navigation mise à jour avec vue clusters"
```

---

## Task 14: Tests d'intégration et vérification

**Files:**
- Aucun nouveau fichier

**Step 1: Lancer les tests backend**

```bash
cd backend
pytest tests/ -v --tb=short
```

Expected: tous les tests passent

**Step 2: Vérifier le build frontend**

```bash
cd frontend
npm run build
```

Expected: build réussi sans erreurs

**Step 3: Tester localement**

```bash
# Terminal 1 : backend
cd backend
uvicorn src.app:app --reload --port 8000

# Terminal 2 : frontend
cd frontend
npm run dev
```

Vérifier :
- `/` affiche les clusters (vide au début)
- `/api/clusters` retourne une réponse JSON valide
- `/api/clusters/refresh` lance embedding + clustering + labelling
- Après refresh, les clusters apparaissent sur le dashboard
- Cliquer sur un cluster montre les articles groupés par pays

**Step 4: Commit final**

```bash
git add -A
git commit -m "feat: Middle East Media Watch v2 - sources refondues, embeddings, clustering thématique"
```

---

## Task 15: Push et déploiement

**Step 1: Push vers GitHub**

```bash
git push -u origin v2/media-watch
```

**Step 2: Configurer Railway**

Créer un nouvel environnement ou de nouveaux services Railway :
- Backend v2 : pointe vers branche `v2/media-watch`, root `backend/`
- Frontend v2 : pointe vers branche `v2/media-watch`, root `frontend/`
- Ajouter `COHERE_API_KEY` aux variables d'environnement du backend

**Step 3: Vérifier le déploiement**

- Backend v2 : `GET /api/clusters` retourne `{"clusters": [], "total": 0, "noise_count": 0}`
- Frontend v2 : dashboard thématique s'affiche
- `POST /api/pipeline` lance collecte + traduction + embedding + clustering
- Après pipeline, les clusters apparaissent

---

## Résumé des commits

1. `feat: refonte registre sources - 39 sources, 12 pays, RSS validés`
2. `feat: ajouter dépendances cohere, hdbscan, scikit-learn`
3. `feat: modèle TopicCluster + colonne embedding sur Article`
4. `feat: service d'embedding Cohere pour articles traduits`
5. `feat: service de clustering HDBSCAN pour groupement thématique`
6. `feat: labelling automatique des clusters par LLM`
7. `feat: API endpoints /api/clusters avec groupement par pays`
8. `feat: intégrer embedding + clustering dans le pipeline automatique`
9. `feat: types et API client pour clusters frontend`
10. `feat: dashboard thématique avec clusters`
11. `feat: page détail cluster avec vue par pays et sélection`
12. `feat: navigation mise à jour avec vue clusters`
13. `feat: Middle East Media Watch v2 - sources refondues, embeddings, clustering thématique`
