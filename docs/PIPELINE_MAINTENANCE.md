# Pipeline — maintenance et validation

## 3. Améliorations optionnelles (non bloquantes)

### Sources Playwright (Khaleej Times, Jordan Times, Peninsula Qatar, etc.)

- **Fait dans le code** (`playwright_scraper.py`) : navigation des pages d’index et d’article en `wait_until="domcontentloaded"` avec délais **60 s** (index) et **45 s** (article), au lieu de `networkidle` + 25–30 s. Les sites avec analytics / long polling ne « se taisent » souvent jamais au réseau, ce qui provoquait des timeouts.
- Si malgré tout une source reste instable : vérifier **WAF / géo** côté hébergeur, ou s’appuyer sur le **RSS** lorsqu’il est fiable (désactiver temporairement `collection_method: playwright` pour cette source dans le registre / BDD).

### Ahval (`tr_ahval`, erreur DNS / `ClientConnectorDNSError`)

- Indépendant de Playwright : échec de résolution ou de connexion vers l’**URL du flux** configurée pour la source.
- **À faire** : depuis l’environnement de prod (ou `curl` / `dig` sur le conteneur), vérifier que le domaine répond ; mettre à jour `rss_url` si le site a changé ; ou **désactiver** la source (`is_active: false`) tant que l’URL n’est pas validée éditorialement.

### Articles en `retry_exhausted` (traduction LLM)

- Consulter les **IDs** dans le JSON du pipeline ou l’admin ; ouvrir **`llm_call_logs`** / **`processing_error`** sur l’article pour le message détaillé (souvent **JSON de réponse mal parsé** ou **contenu vide**).
- En file : endpoint **batch retry translation** (`POST /api/articles/batch-retry-translation`) après correction de prompt ou de données.

### Registre `media_sources` (doublons de noms)

- Plusieurs lignes avec le même nom viennent du **registre** (fusion CSV / JSON). Ce n’est pas qu’un problème d’UI : fusionner ou renommer en base / dans `MEDIA_REGISTRY.json` + `MEDIA_REVUE_REGISTRY.json` selon votre procédure de seed.

## 4. Validation rapide après déploiement

1. Lancer un **pipeline complet** (ou au minimum collecte + embeddings).
2. Dans le JSON de stat : **`stats.embedding`** ne doit **pas** contenir d’erreur du type *« The truth value of an array… »* (bug applicatif corrigé côté service Cohere / embeddings).
3. **Collecte** : le bloc `playwright_scraper.errors` ne doit plus lister systématiquement les trois timeouts **Khaleej / Jordan Times / Peninsula** si le correctif `domcontentloaded` suffit ; sinon investiguer réseau ou source.
4. **UI sources** : l’endpoint `GET /api/media-sources/health` doit afficher `health_status: ok` lorsqu’il y a des articles sur **72 h** et **0** run vide consécutif, même si le statut persisté était `degraded` / `dead`.
