# IMPLEMENTATION_ROADMAP.md
## Plan de développement en 5 sprints (12 jours)

---

## Sprint 1 — Setup + Collecte RSS + BDD (3 jours)

### Jour 1 : Setup projet
**Fichiers à créer :**
- `press_review/requirements.txt` ✅ (fourni)
- `press_review/.env.example` ✅ (fourni)
- `press_review/src/config.py` ✅ (fourni)
- `press_review/src/models/database.py` ✅ (fourni)
- `press_review/src/scripts/seed_media.py` ← À créer

**Commandes :**
```bash
cd press_review
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Configurer PostgreSQL local ou Railway
cp .env.example .env  # Remplir DATABASE_URL + ANTHROPIC_API_KEY
psql $DATABASE_URL -f ../DATABASE_SCHEMA.sql
python src/scripts/seed_media.py  # Insère les 48 médias
```

**Script seed_media.py :**
```python
"""Insert MEDIA_REGISTRY.json into media_sources table."""
import json
import asyncio
from sqlalchemy import text
from src.models.database import get_session_factory, MediaSource

async def seed():
    with open("../MEDIA_REGISTRY.json") as f:
        data = json.load(f)
    
    sf = get_session_factory()
    async with sf() as db:
        for m in data["media"]:
            source = MediaSource(
                id=m["id"],
                name=m["name"],
                country=m["country"],
                country_code=m["country_code"],
                tier=m["tier"],
                languages=m["languages"],
                editorial_line=m.get("editorial_line"),
                bias=m.get("bias"),
                content_types=m.get("content_types"),
                url=m["url"],
                rss_url=m.get("rss_url"),
                english_version_url=m.get("english_version", {}).get("url"),
                collection_method=m.get("collection_method", "rss"),
                paywall=m.get("paywall", "free"),
                translation_quality=m.get("translation_quality_to_fr", "high"),
                editorial_notes=m.get("editorial_notes"),
            )
            db.add(source)
        await db.commit()
    print(f"Seeded {len(data['media'])} media sources")

asyncio.run(seed())
```

**Test de validation :**
```bash
psql $DATABASE_URL -c "SELECT count(*) FROM media_sources;"
# Expected: 48
```

### Jour 2-3 : Collecte RSS
**Fichiers :** `src/collectors/rss_collector.py` ✅ (fourni)

**Test manuel sur 5 sources :**
```python
# tests/test_collectors.py
import pytest
import asyncio
from src.collectors.rss_collector import RSSCollector

@pytest.mark.asyncio
async def test_collect_single_source():
    collector = RSSCollector()
    # Test Times of Israel (free, good RSS)
    stats = await collector.collect_all()
    assert stats["total_new"] > 0
    assert len(stats["errors"]) < stats["total_sources"]
```

**Critères de validation Sprint 1 :**
- [ ] 48 médias en BDD
- [ ] Collecte RSS fonctionne sur ≥ 35 sources
- [ ] Déduplication URL effective
- [ ] Articles stockés avec contenu extrait

---

## Sprint 2 — Pipeline LLM (3 jours)

### Jour 4-5 : Traduction + Résumé
**Fichiers :** `src/processors/translator.py` ✅ (fourni)

**Test sur 10 articles variés :**
```python
@pytest.mark.asyncio
async def test_translation_quality():
    pipeline = TranslationPipeline()
    stats = await pipeline.process_pending_articles(limit=10)
    assert stats["processed"] >= 8  # 80%+ success rate
    
    # Verify summary length
    async with session_factory() as db:
        articles = await db.execute(
            select(Article).where(Article.status == "translated").limit(5)
        )
        for art in articles.scalars():
            words = len(art.summary_fr.split())
            assert 140 <= words <= 210  # Slight tolerance
```

### Jour 6 : Génération format OLJ
**Fichiers :** `src/generators/press_review.py` ✅ (fourni)

**Vérification du format :**
```python
@pytest.mark.asyncio
async def test_olj_format():
    gen = PressReviewGenerator()
    block = await gen.generate_block(test_article_id)
    assert "«" in block and "»" in block  # Guillemets français
    assert "Fiche :" in block
    assert "Article publié dans" in block
    assert "Langue originale :" in block
```

**Critères de validation Sprint 2 :**
- [ ] Résumés en 150-200 mots (± 10 mots tolérance)
- [ ] Ton neutre vérifiable
- [ ] Format OLJ exact (titre «», fiche, attributions)
- [ ] Score confiance calculé pour chaque article
- [ ] Coût < $0.01 par article traduit

---

## Sprint 3 — Interface Streamlit (2 jours)

### Jour 7-8
**Fichiers :** `interface/app.py` ✅ (fourni)

**Fonctionnalités à valider :**
- [ ] Liste des articles du jour avec filtres (pays, type, confiance)
- [ ] Indicateur visuel de confiance (vert/jaune/rouge)
- [ ] Sélection multiple d'articles
- [ ] Aperçu du résumé dans l'expandeur
- [ ] Bouton "Générer la revue" → appel Claude Sonnet
- [ ] Zone de texte avec le résultat formaté
- [ ] Bouton de téléchargement .txt
- [ ] Lien vers l'article original

---

## Sprint 4 — Intégration (2 jours)

### Jour 9-10
**Fichiers :** `src/main.py` ✅ (fourni), `src/scheduler/daily_pipeline.py` ✅ (fourni)

**Tests d'intégration :**
```bash
# Pipeline bout-en-bout
curl -X POST http://localhost:8000/api/pipeline
# Vérifier le résultat
curl http://localhost:8000/api/articles?status=translated&limit=5
# Générer une revue
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '["article-uuid-1", "article-uuid-2", "article-uuid-3"]'
```

---

## Sprint 5 — Déploiement Railway (2 jours)

### Jour 11-12
Voir **RAILWAY_DEPLOYMENT.md** pour le détail complet.

```bash
# Depuis le repo
railway login
railway init
railway add --database postgresql
railway up
# Configurer les env vars dans le dashboard Railway
```

**Critères de validation finale :**
- [ ] Pipeline automatique s'exécute 2x/jour (06:00 + 14:00 UTC)
- [ ] Interface Streamlit accessible via URL Railway
- [ ] API FastAPI opérationnelle avec /health
- [ ] Coût mensuel < $60 en scénario réaliste
- [ ] < 5% d'erreurs de collecte/traduction
