# SLA interne — santé des sources (MEMW)

Objectifs **internes** (non contractuels) pour la collecte. La fenêtre UI « 72 h » suit `articles.collected_at` (voir `GET /api/media-sources/health`).

## Bandes de tier

| Bande | Critère | Action si non respecté |
|-------|---------|-------------------------|
| **P0** | Aucune source P0 en `dead` plus de **7 jours** sans ticket | Investigation prioritaire + correctif URL / méthode / hub |
| **P1** | Moins de **25 %** des P1 en `dead` simultanément | Planifier correctifs par lot navigateur |
| **P2+** | Traiter selon capacité | Backlog |

## Alertes

- Le collecteur appelle déjà `post_dead_source_alert` lors d’un passage de source en état dégradé mort (voir `alerts.py`).
- Le champ API `critical_p0_sources_down` expose le nombre de P0 en `dead` : utilisable pour un dashboard ou une alerte Prometheus externe (à brancher côté infra).

## Mesures

- Exporter un instantané : `python -m src.scripts.export_media_sources_health --output data/MEDIA_HEALTH_EXPORT.json --csv data/MEDIA_HEALTH_EXPORT.csv`
- Taux de réussite scraping par rubrique (CSV) : `python -m src.scripts.verify_scrape_one_per_rubrique --output data/SCRAPING_E2E_MATRIX.json`

## Gate CI (optionnel)

Après génération du rapport JSON ci-dessus :

```bash
set MEMW_SCRAPING_E2E_REPORT=data/SCRAPING_E2E_MATRIX.json
set MEMW_SCRAPING_E2E_MIN_PASS_RATIO=0.85
pytest tests/test_scraping_e2e_gate.py
```

Voir aussi [SLO.md](SLO.md) pour les métriques pipeline générales.
