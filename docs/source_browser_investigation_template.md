# Fiche investigation source (navigateur) — lot P0 / P1

Une fiche par média ou par URL de rubrique problématique.

| Champ | Valeur |
|--------|--------|
| Date | |
| `media_source_id` | |
| Nom affiché | |
| Tier / bande | |
| URL hub / RSS testée | |
| Méthode collecte (`rss` / `scraping` / `playwright` / `opinion_hub`) | |

## Observation page

- [ ] Page liste charge sans login payant
- [ ] Présence Cloudflare / challenge / blocage datacenter
- [ ] Rendu JS (SPA) : liens visibles après scroll / délai
- [ ] Structure DOM : sélecteur liste articles (noter classes / `article` / `a[href]`)

## Réseau (DevTools)

- Status HTTP hub : …
- Status HTTP article type : …
- Redirections inhabituelles : …

## Décision

- [ ] `rss_fix` — nouvelle URL de flux
- [ ] `playwright_config` — ajuster `PLAYWRIGHT_CONFIGS` + `collection_method: playwright`
- [ ] `scraping` — ajuster `SOURCE_CONFIGS` + `collection_method: scraping`
- [ ] `hub_override` — `OPINION_HUB_OVERRIDES.json` / `opinion_hub_urls_json`
- [ ] `hors_scope` — paywall / CGU / inaccessible
- [ ] `desactiver` — `is_active: false` + note

## Suivi

- PR / commit :
- Résultat `verify_scrape_one_per_rubrique` (PASS/FAIL) :
