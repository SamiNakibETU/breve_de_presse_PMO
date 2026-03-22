# Comment atteindre « 100 % » MEMW (spec v3 + recette produit)

Le code du dépôt peut être **complet pour une vague donnée**, mais **100 %** au sens **métier + infra + validation** exige les étapes ci-dessous. Cochez-les sur staging puis production.

## 1. Base de données (bloquant)

- Sur **chaque** environnement (staging, prod) :  
  `alembic upgrade head`  
  Vérifier notamment : `relevance_band`, `translation_quality_flags`, `dedup_feedback`, schéma éditions / `llm_call_logs` / `pipeline_debug_logs`.
- PostgreSQL + extension `vector` (pgvector) pour embeddings et recherche sémantique.

## 2. Secrets et auth (bloquant)

- **`INTERNAL_API_KEY`** identique backend et (si mode direct) `NEXT_PUBLIC_API_KEY` frontend — **ou** mode **proxy** Next avec clé **uniquement** serveur.
- Toutes les mutations et la **lecture régie** (`/api/regie/*`) refusent sans Bearer si la clé est définie.

## 3. Fournisseurs externes (bloquant pipeline)

- `COHERE_API_KEY` (embeddings).
- Au moins une clé LLM opérationnelle (Groq / Cerebras / Anthropic selon langues).
- RSS / scrapers : pas de blocage massif (WAF, paywalls) sur les sources P0.

## 4. Recette produit (manuel — [RECETTE_STAGING.md](RECETTE_STAGING.md))

- Parcours **Sommaire → Sujet → Composition** sans erreur.
- **Traitement complet** sans erreur dans l’étape embedding (Sprint 1 spec).
- **Régie** : `/regie/pipeline`, `/regie/logs` alimentés après un run (données en base).
- Temps **≤ 30 min** du parcours journaliste (spec A1) — chronométrage réel.

## 5. Sources et registres (éditorial)

- Une seule vérité CSV : [`MEMW_CANONICAL.md`](MEMW_CANONICAL.md).
- `python -m src.scripts.import_media_revue_csv` puis seed si besoin.
- Mettre à jour [`source_diagnostics.md`](source_diagnostics.md) après les runs (sources à 0 article).

## 6. Ce qui reste « hors code » (spec H2, alertes, 100 % organisationnel)

- **Alertes** (échecs collecte, quotas LLM) : à brancher sur votre stack (Prometheus, PagerDuty, e-mail) — non livré comme produit fini dans le repo.
- **Archivage** du doublon `MEMW_SPEC_FINALE_v3 (1).md` : fusionner dans le fichier canonique ou le supprimer du flux de travail pour éviter la dérive documentaire.
- **Validation rédaction** (Emilie / OLJ) : wireframes D6, ton OLJ, liste de sources définitive.

## 7. Définition de « terminé »

| Niveau | Critère |
|--------|--------|
| **Tech** | CI verte, migrations OK, déploiement sans 500 sur les parcours principaux. |
| **Produit** | Recette [RECETTE_STAGING.md](RECETTE_STAGING.md) entièrement cochée sur staging. |
| **100 % spec** | Décision explicite sur les items volontairement hors scope (alertes H2, feedback dédup exploité en analyse, etc.). |
