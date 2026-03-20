# Revue de presse Proche-Orient — alignement OLJ & feuille de route « état de l’art » (mars 2026)

Document de cadrage : adéquation du pipeline actuel avec la **revue semi-automatisée** et un **Middle East media watch** exigeant, puis **axes d’amélioration** priorisés (technique, éditorial, produit).

---

## 1. Adéquation avec la volonté éditoriale OLJ

### Ce que le système fait déjà bien

| Besoin OLJ | Réponse actuelle |
|------------|------------------|
| Couvrir **beaucoup de titres** régionaux (liste revue CSV / registre) | Registre `MEDIA_REVUE_REGISTRY.json`, collecte **hubs opinion** + overrides |
| **Extraire le texte** des pages (pas seulement les titres) | `hub_article_extract` + trafilatura / Playwright |
| **Traduire / résumer** pour le flux français | Pipeline API (Claude) + articles en base |
| **Filtrer** le hors-périmètre évident | `editorial_scope`, heuristiques corps / titre |
| **Contourner partiellement** WAF / Cloudflare | RSS prioritaire, `curl_cffi`, Playwright, flux multiples (`rss_feed_urls`) |

### Limites structurantes (à assumer côté rédaction)

1. **« Media watch ultra performant »** sur le **sujet précis** (ex. « ligne iranienne des quotidiens koweïtiens sur le détroit ») n’est **pas** réduit à la collecte : il faut une couche **sémantique + temporelle + scoring** au-dessus des articles (voir §3).
2. **Blocages anti-bot** : aucune stack n’est « imparable » sans **coût** (proxies résidentiels, partenariats, flux officiels, API éditeur). La stratégie saine est **RSS / API / accords** d’abord, scraping en dernier recours.
3. **Paywalls** : le registre marque surtout `free` ; la **réalité** peut être *soft* / compteur. Il faut **signalement** en base (`paywall` réel), **détection heuristique** (déjà amorcée dans les scripts de vérif) et règles rédactionnelles.

---

## 2. Renforts techniques déjà livrés (mars 2026)

- **`strict_link_pattern`** : pour Sabah / Milliyet, seules les URLs du type `/yazarlar/{auteur}/{article}` passent — plus de pages « liste de colonnes ».
- **`rss_feed_urls`** : plusieurs flux par source ; le collecteur les essaie **en série** jusqu’à remplir les liens.
- **Overrides élargis** : Gulf News (`/feed` + filtre `/opinion/`), Madamasr, IranWire (`/blogs/`), 7al, doubles flux `www` pour Al-Watan BH & Al-Sabah IQ, Al Arabiya MRSS + filtre `/views/`, Playwright renforcé sur domaines CF, etc.
- **Fichier** : `backend/data/OPINION_HUB_OVERRIDES.json` — à **revalider** trimestriellement (les médias changent d’URL de flux sans prévenir).

---

## 3. Plan d’amélioration « état de l’art » (priorisé)

### A. Données & modèle informationnel

1. **Schéma article enrichi** : `topics[]`, `entities[]` (Pays, Acteur, Conflit), `stance` (vers cible), `article_family` (éditorial / analyse / reportage / tribune), `primary_event` (lien vers événement normalisé), `source_tier`, `language_detected`, `paywall_observed`.
2. **Lien temporel** : fenêtre de validité des faits, **date de publication** fiable (parfois absente du HTML — extraction JSON-LD / meta).
3. **Dédoublonnage cross-médias** : embeddings multilingues (ex. modèles **multilingues** type E5 / LaBSE / modèle ar intégré) + seuil + **canonical URL** ; cluster « même histoire » pour la revue.
4. **Graphe léger** : entités et événements réutilisables entre runs (éviter de re-payer du LLM sur les mêmes entités).

### B. Détection de sujets & veille (cœur « media watch »)

1. **Taxonomie OLJ** : arbre de thèmes (géopolitique, économie régionale, conflits, société, climat, tech…) **validé par la rédaction** — pas seulement des tags LLM libres.
2. **Classification hiérarchique** : classifieur **fine-tuné** ou few-shot contraint sur votre taxonomie + marge de confiance ; le LLM en **fallback** seulement.
3. **Détection d’événements** : template « qui / quoi / où / quand » + score de complétude ; alertes sur **nouveaux clusters** ou **rupture de narrative** (comparaison avec fenêtre glissante).
4. **Veille par requête** (« Iran + missiles + Golfe ») : **recherche sémantique** (pgvector déjà dans l’archi) + filtres pays / langue / date + **résumé synthétique** quotidien généré.

### C. Qualité éditoriale & traduction

1. **Métriques de traduction** : échantillon humain noté ; suivi **terminologie** (glossaire OLJ injecté en prompt ou RAG).
2. **Cohérence ton OLJ** : prompt / fine-tune pour le **format revue** (titres, longueur, neutralité / posture assumée).
3. **Traçabilité** : chaque phrase de synthèse liée à **citations sources** (extrait + URL) pour la confiance rédactionnelle.

### D. Produit journaliste (semi-automatisation)

1. **Tableau de bord priorisé** : tri par **pertinence thématique du jour**, nouveauté, diversité pays / ligne éditoriale, pas seulement par date.
2. **Explicabilité** : « pourquoi cet article est proposé » (thèmes, entités, similarité avec la une du jour).
3. **Workflow** : brouillon revue → validation → export CMS — avec **historique** et **versioning**.

### E. Fiabilité opérationnelle

1. **SLO** : taux de collecte par source, latence, taux CF — **alertes** si régression.
2. **Coût** : budget tokens par étape ; cache des extractions HTML / résumés intermédiaires.
3. **Conformité** : robots.txt, conditions d’usage, **mention des sources** dans la revue (déjà aligné déontologie presse).

### F. R&D (horizon 6–18 mois)

- **Speech / TV** si extension vers vidéo (Whisper + segmentation).
- **Veille réseaux** (X / officiels) en **complément** signal, pas substitut au long format.
- **Évaluation continue** : jeux de données internes « gold » pour extraction, classification, traduction.

---

## 4. Synthèse : le pipeline actuel est-il « adapté » ?

- **Oui** comme **premier étage industriel** : collecte large, extraction, traduction, sélection humaine, génération format revue.
- **Pas encore** comme **media watch état de l’art** : il manque la couche **sémantique structurée** (taxonomie, événements, clustering, recherche par sujet, alertes), l’**évaluation** systématique, et la **résilience** contractuelle (flux RSS/API) sur les sites les plus hostiles.

La suite logique : **stabiliser la collecte** (overrides + vérifs automatiques CI) puis **investir dans la couche analytique** (entités + topics + vecteurs + UI) — c’est là que la valeur OLJ se différencie d’un simple agrégateur RSS.

---

## 5. Références internes projet

- Overrides : `backend/data/OPINION_HUB_OVERRIDES.json` (`rss_feed_url`, `rss_feed_urls`, `strict_link_pattern`, `link_pattern`, …)
- Vérif contenu : `python -m src.scripts.verify_opinion_hub_content`
- Vérif hubs : `python -m src.scripts.validate_media_hubs`
