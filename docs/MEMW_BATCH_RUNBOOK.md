# Runbook — itération scraper par lots de 5

Cadre : accès crawler assumé autorisé ; pas de dépaywallage tiers ni anti-captcha automatisé. Voir [MEMW_LEGITIMATE_SCRAPING_SCOPE.md](MEMW_LEGITIMATE_SCRAPING_SCOPE.md).

## Prérequis

- Fichier source : `media revue - Sheet1.csv` à la **racine du dépôt** ou dans **`archive/`** (même nom).
- Registre à jour : `python -m src.scripts.import_media_revue_csv` régénère `data/MEDIA_REVUE_REGISTRY.json` depuis ce CSV.
- Lancer les commandes depuis le répertoire **`backend/`**.

## Tout le périmètre CSV : import + alignement + 1 article par rubrique

```bash
python -m src.scripts.run_full_csv_hub_scrape --output data/SCRAPING_E2E_FULL_CSV.json
```

Options utiles : `--skip-import` (JSON déjà importé), `--no-article-sample` (hubs seuls), `--ids id1,id2`, `--max-media N`, `--strict-exit-code`.

Équivalent manuel : `import_media_revue_csv` → `verify_media_revue_registry_vs_csv` → `verify_scrape_one_per_rubrique` (ou `--from-csv` pour lire le CSV résolu sans toucher au JSON).

## Lister les lots

```bash
python -m src.scripts.run_scrape_batches --list-batches
```

## Exécuter un lot (5 médias, ordre stable = tri par `id`)

```bash
python -m src.scripts.run_scrape_batches --batch-index 0
python -m src.scripts.run_scrape_batches --batch-index 1 --batch-size 5
```

Variante plus rapide (sans échantillon article) :

```bash
python -m src.scripts.run_scrape_batches --batch-index 0 --no-article-sample
```

Sortie par défaut : `backend/data/SCRAPING_BATCH_0000.json`, etc. Le rapport inclut `batch_id`, `batch_index`, `batch_size`, `batch_media_ids`, et pour chaque hub un objet **`diagnostics`** (`diagnosis_class`, `page_diagnostics`, `override_keys`, …).

## Relancer uniquement des sources en échec

Après lecture du JSON du lot, repérer les `id` concernés puis :

```bash
python -m src.scripts.validate_media_hubs --ids id1,id2 --output data/HUB_RETRY.json
```

Ou matrice E2E :

```bash
python -m src.scripts.verify_scrape_one_per_rubrique --ids id1,id2
```

## Interpréter `diagnosis_class`

| Classe          | Lecture courte                                      | Piste de config |
|-----------------|-----------------------------------------------------|-----------------|
| `cf_block`      | Page ou flux ressemble à un interstitial / challenge Cloudflare | Flux RSS dans `OPINION_HUB_OVERRIDES.json`, ou limite éditeur |
| `spa_shell`     | Coque JS, peu de liens same-origin                  | `playwright`, `wait_ms`, `wait_for_selector`, `scroll_page` |
| `thin_html`     | HTML très court ou vide                             | Vérifier URL hub, blocage réseau, besoin Playwright |
| `looks_editorial` | Signaux éditoriaux présents (liens, ld+json, …)  | Souvent OK côté page ; si peu de liens extraits, ajuster `link_pattern` / sélecteurs |
| `rss_feed`      | Stratégie uniquement RSS a suffi                    | RAS si les liens et l’échantillon article passent |
| `unknown`       | Aucun signal fort                                   | Investiguer `page_diagnostics` et logs structurés |

Les étapes détaillées par tentative apparaissent dans les logs (niveau **debug** pour `hub_fetch` / `hub_playwright`) avec des champs standardisés : `stage`, `attempt`, `http_status`, `content_type`, `html_len`, `body_bytes`, `cf_interstitial`, `elapsed_ms`, `error_code`, `override_keys`, et `batch_id` si exécution batch.

**Chaîne HTTP (`fetch_html_robust`)** : `aiohttp` en premier ; si échec ou corps trop petit, **curl_cffi** (empreinte TLS type navigateur) est tenté sur la même URL ; en dernier recours, **trafilatura** si `try_trafilatura_fallback=True`. Un log `hub_fetch.curl_cffi_ok` (niveau info) confirme que c’est curl_cffi qui a débloqué la page après échec aiohttp.

## Exemple de correctif (override)

Si `diagnosis_class` = `cf_block` sur le hub HTML mais un flux public existe :

1. Ouvrir `backend/data/OPINION_HUB_OVERRIDES.json`.
2. Ajouter ou compléter pour le `source_id` : `rss_feed_url` / `rss_feed_urls`, éventuellement `rss_link_filter` pour ne garder que la rubrique visée.
3. Relancer : `python -m src.scripts.validate_media_hubs --ids id1,id2` ou rejouer le lot avec `run_scrape_batches --batch-index N`.

## Enchaîner les lots 0 → 1 → 2

```bash
python -m src.scripts.run_scrape_batches --batch-index 0 --no-article-sample --pause-seconds 3
python -m src.scripts.run_scrape_batches --batch-index 1 --no-article-sample --pause-seconds 3
python -m src.scripts.run_scrape_batches --batch-index 2 --no-article-sample
```

Critère d’arrêt : plus d’actions configurables sans infrastructure externe, ou ticket éditeur (flux dédié, allowlist).

## Pilote lots 0–2 (validation des rapports)

Une exécution réelle des lots `0000`–`0002` avec `--no-article-sample` produit les fichiers `data/SCRAPING_BATCH_0000.json` … `0002.json`. Les échecs observés relèvent surtout de **`cf_block`** (pages hub ou réponses RSS derrière challenge), de **`http_403`** sur flux ou hub, ou de **flux RSS sans entrée** après `rss_link_filter` (ex. Gulf News : `n=0` dans les logs). Aucun changement automatique dans `OPINION_HUB_OVERRIDES.json` n’a été appliqué : ces cas demandent une décision éditeur (autre flux, rubrique, ou acceptation du dégradé), conformément au plan.

## Voir aussi

- [SOURCE_REMEDIATION_PLAYBOOK.md](SOURCE_REMEDIATION_PLAYBOOK.md) — diagnostic et correctifs sans toucher à `collector.py`.
