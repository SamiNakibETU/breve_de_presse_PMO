# Spec — Vague 1 : pays (ISO) + API agrégats ; sources / registre / Régie

**Date :** 2026-04-06  
**Références :** [docs/plan.md](../../../plan.md) §3, §9 ; [AGENTS.md](../../../AGENTS.md).

## Problème

1. **Pays** : certaines routes agrègent sur `MediaSource.country` (libellé texte) au lieu de `country_code` (ISO2), ce qui crée **plusieurs clés** pour un même pays (ex. orthographes, variations). Exemple actuel : [`backend/src/routers/articles.py`](../../../backend/src/routers/articles.py) — endpoint stats 24h, `group_by(MediaSource.country)` pour `by_country` (lignes ~551–623). D’autres chemins utilisent déjà `country_code` (ex. filtres liste articles, `counts_by_country` sur code dans la même base de routes).
2. **Clusters** : [`backend/src/routers/clusters.py`](../../../backend/src/routers/clusters.py) groupe les articles du cluster par `article.media_source.country` avec repli « Inconnu » ; `REGIONAL_COUNTRIES` compare des **noms** — à aligner sur des **codes** pour cohérence avec le reste de l’API.
3. **Sources / Régie** : le périmètre affiché et les chiffres de santé doivent refléter **strictement** le registre médias revue ([`backend/data/MEDIA_REVUE_REGISTRY.json`](../../../backend/data/MEDIA_REVUE_REGISTRY.json)) et l’état réel des jobs / [`media_sources_health_payload`](../../../backend/src/services/media_sources_health_payload.py), sans mélange avec d’anciennes listes ([`MEDIA_REGISTRY.json`](../../../backend/data/MEDIA_REGISTRY.json) hors périmètre revue si l’UI Régie est « revue » uniquement).

## Objectifs

- **API** : exposer les agrégats « par pays » sous forme **`Record<country_code, number>`** (clés ISO2 normalisées en majuscules), et fournir **`labels_fr`** via une source unique (étendre ou réutiliser [`backend/src/services/country_utils.py`](../../../backend/src/services/country_utils.py) — `COUNTRY_CANONICAL`, `country_label_fr`).
- **Rétrocompatibilité** : soit migration de schéma de réponse versionnée (`by_country_v2` + déprécation annoncée), soit ajout de champs parallèles (`counts_by_country_code`, `country_labels_fr`) sans casser le front existant jusqu’au portage.
- **Données** : script ou migration **additive** pour normaliser les `MediaSource.country` incohérents **à partir de** `country_code` (pas de DROP) ; documenter les cas limites (code manquant → règle explicite).
- **Régie / sources** : carte claire des écrans « sources revue » vs générique ; documenter dans la spec d’implémentation quelles routes lisent quel registre ; vérifier que les IDs / slugs affichés sont traçables vers le CSV / JSON validé OLJ.

## Périmètre technique (indicatif)

| Zone | Action |
|------|--------|
| `backend/src/routers/articles.py` | Remplacer ou compléter agrégats 24h `by_country` basés sur libellé par agrégation sur `country_code` ; joindre labels côté réponse. |
| `backend/src/routers/clusters.py` | Grouper par `country_code` ; calcul `regional` / `international` via liste de codes (réutiliser `COVERAGE_TARGET_COUNTRIES` ou ensemble régional défini une seule fois). |
| `backend/src/schemas/*.py` | Étendre schémas Pydantic pour nouveaux champs si nécessaire. |
| `frontend/` + `design/revue-playground/` | Consommer `country_code` + `labels_fr` pour filtres et Panorama (dans une PR dédiée après API stable). |
| Scripts | `import_media_revue_csv` / vérifs existantes [`verify_media_revue_registry_vs_csv.py`](../../../backend/src/scripts/verify_media_revue_registry_vs_csv.py) — s’assurer que réimport ne recrée pas de divergences pays. |

## Critères d’acceptation

- Aucune paire de codes ISO identiques ne produit deux lignes distinctes dans les agrégats « par pays » pour une même fenêtre temporelle.
- `GET /api/config/coverage-targets` reste cohérent avec les libellés utilisés pour les graphiques / filtres (une seule vérité pour le FR).
- Documentation courte dans `docs/MEDIA_REVUE.md` ou équivalent : « périmètre registre revue » + lien vers health payload.

## Risques

- **Casse front** si les clés passent de libellé FR à code ISO sans phase de transition : prévoir champs doublons ou version d’API.
- **Données historiques** : `country_code` vide ou erroné sur vieilles lignes — règle de fallback (`XX` + libellé « Inconnu ») documentée.

## Hors-scope

- Modification de `collector.py` pour changer la collecte (interdit) ; toute correction amont des pays reste par **données** (seed, script, migration additive) ou services non listés comme interdits.
