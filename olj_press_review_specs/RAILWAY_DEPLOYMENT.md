# RAILWAY_DEPLOYMENT.md
## Guide de déploiement sur Railway

---

## 1. Architecture de déploiement

Le système se déploie en 3 services Railway dans un même projet :

```
[Railway Project: olj-press-review]
├── Service 1: FastAPI (API + Scheduler)  ← railway.toml
├── Service 2: Streamlit (Interface)      ← Procfile ou start command
└── Database: PostgreSQL + pgvector       ← One-click template
```

## 2. Setup PostgreSQL + pgvector

```bash
# Dans le dashboard Railway :
# 1. Add → Database → PostgreSQL
# 2. Ou utiliser le template pgvector one-click :
#    https://railway.com/deploy/postgres-with-pgvector-engine

# Railway crée automatiquement les variables :
# DATABASE_URL, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
```

Après création de la BDD :
```bash
# Exécuter le schéma
railway run psql -f DATABASE_SCHEMA.sql

# Vérifier pgvector
railway run psql -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

## 3. Configuration railway.toml

Fichier déjà fourni dans `press_review/railway.toml` :
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn src.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 5
```

## 4. Variables d'environnement

Configurer dans Railway Dashboard → Service → Variables :

| Variable | Valeur | Notes |
|----------|--------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Référence auto Railway (remplacer `postgresql://` par `postgresql+asyncpg://`) |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` | Clé API Anthropic |
| `OPENAI_API_KEY` | `sk-...` | Pour embeddings (optionnel MVP) |
| `ENVIRONMENT` | `production` | |
| `LOG_LEVEL` | `INFO` | |
| `COLLECTION_HOUR_UTC` | `6` | 08:00 Beyrouth |
| `PORT` | `${{PORT}}` | Auto Railway |

**IMPORTANT** : Railway fournit `DATABASE_URL` en format `postgresql://`. Pour asyncpg, il faut `postgresql+asyncpg://`. Adapter dans `config.py` :
```python
@property
def async_database_url(self):
    url = self.database_url
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url
```

## 5. Déploiement FastAPI

```bash
cd press_review
railway login
railway link  # Lier au projet existant
railway up    # Déployer

# Vérifier
railway logs
curl https://your-service.railway.app/health
```

## 6. Déploiement Streamlit (service séparé)

Créer un second service dans le même projet Railway :
```bash
# Service 2 : Streamlit
# Start command : streamlit run interface/app.py --server.port $PORT --server.address 0.0.0.0
```

Ou via `Procfile` :
```
web: streamlit run interface/app.py --server.port $PORT --server.address 0.0.0.0 --server.headless true
```

## 7. Monitoring et alertes

### Health checks
- FastAPI : `GET /health` → `{"status": "ok"}`
- Streamlit : Healthcheck natif Railway

### Logs
```bash
railway logs --service fastapi
railway logs --service streamlit
```

### Alertes recommandées
Configurer dans Railway ou via webhook Slack :
- Service restart → Alerte
- CPU > 80% pendant 5 min → Alerte
- Erreurs > 10/heure dans les logs → Alerte

## 8. Rollback

```bash
# Voir les déploiements précédents
railway deployments

# Rollback au déploiement précédent
railway rollback [deployment-id]
```

## 9. Coûts estimés Railway

| Composant | Usage estimé | Coût mensuel |
|-----------|-------------|-------------|
| FastAPI service | ~200 CPU-min/jour, 256MB RAM | $5-10 |
| PostgreSQL | ~1GB storage, 256MB RAM | $5-8 |
| Streamlit | ~100 CPU-min/jour, 128MB RAM | $3-5 |
| **Total** | | **$13-23/mois** |

Avec le plan Hobby ($5/mois inclus), le surcoût est de ~$8-18/mois.
Avec le plan Pro ($20/mois inclus), potentiellement $0 de surcoût.

## 10. Backup et restauration

```bash
# Backup PostgreSQL
railway run pg_dump --format=custom > backup_$(date +%Y%m%d).dump

# Restauration
railway run pg_restore --clean --if-exists < backup.dump
```
