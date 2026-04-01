# Intégration cascade scraping (MEMW) — jalons

Ce document fixe le **mapping** entre le scraper autonome de référence (`scraper/retenu_final`, README détaillé) et le backend OLJ, sans modifier les modules interdits (`collector.py`, etc.).

## C1 — Cartographie

| Zone | Rôle |
|------|------|
| `scraper/retenu_final/olj_revue/scrape_cascade.py` | Cascade « UltraScraperV3 » : HTTP → curl_cffi → Playwright → Selenium → Scrapling ; découverte de liens sur hubs ; cas Cloudflare ciblés. |
| `scraper/retenu_final/olj_revue/smart_content.py` | Trafilatura + filtrage d’URLs article (`filter_article_urls`, bruit login/pdf/tag…). |
| `backend/src/services/hub_article_extract.py` | Pipeline **production** article : `fetch_html_robust` → trafilatura → Playwright si corps court / CF ; **repli additionnel** si `enhanced_scraper_enabled` : 2ᵉ fetch Playwright avec `scroll_page=True` et `wait_until=load` lorsque le corps reste insuffisant. |
| `backend/src/services/enhanced_scraper.py` | Point d’entrée unique `extract_article_page_enhanced` → délègue à `extract_hub_article_page` (comportement ci-dessus derrière le flag). |
| `backend/src/services/enhanced_link_discovery.py` | Découverte légère de liens sur HTML de hub : même esprit que `filter_article_urls` (même domaine, sous-chaînes de bruit communes). |

## C2 — Repli activable (`enhanced_scraper_enabled`)

Lorsque le flag est **true**, après le passage Playwright standard, si le corps extrait ne satisfait pas `is_substantial_article_body`, un **second** passage Playwright avec défilement de page est tenté. Les stratégies retournées incluent alors un suffixe du type `…+enhanced_scroll`.

## C3 — Découverte de liens

`discover_article_links_from_html` reste réservé aux **tests / comparaisons** ; les heuristiques de bruit (login, newsletter, médias, etc.) sont alignées sur les préfixes documentés dans `scraper/retenu_final/olj_revue/smart_content.py`.

## Persistance métadonnées

Les colonnes SQL `scrape_method` / `scrape_cascade_attempts` (migration plan v2) peuvent être renseignées par la couche d’ingestion qui appelle `extract_hub_article_page` / `extract_article_page_enhanced` lorsque l’on branchera l’écriture complète des métadonnées de cascade.
