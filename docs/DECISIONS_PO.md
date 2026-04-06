# Décisions produit / architecture (plan v2 — suivi)

Document de synthèse pour les points laissés ouverts dans l’audit architectural ; à ajuster avec la rédaction et la direction OLJ.

| Sujet | Décision provisoire / implémentation |
| --- | --- |
| **`/panorama`** | Redirection `/panorama` → `/dashboard` ; le menu principal pointe « Panorama » vers le tableau de bord. |
| **`/review`** | Ancien flux conservé en URL directe avec bandeau de dépréciation ; pas d’entrée dans la navigation principale. |
| **TTL rétention articles sélectionnés** | `retention_until` + job quotidien (03:30 Asia/Beirut) pour nettoyer les drapeaux expirés ; pas de suppression automatique du corps traduit (hors périmètre `translator.py`). |
| **Traduction corps forcée** | Non implémentée sans modifier `translator.py` ; la rétention marque l’article côté base. |
| **SeleniumBase / Scrapling en prod** | Non activés par défaut ; `enhanced_scraper_enabled` délègue au pipeline `hub_article_extract` existant. |
| **Snippet pour l’analyse LLM** | Défini côté serveur dans `article_analyst.py` (résumé + extrait). |
| **Consignes structurées** | JSON `v:1` stocké dans `compose_instructions_fr` + texte dérivé pour le LLM (`buildInstructionSuffixForLlm`). |
| **Sessions journalistes (sélections par utilisateur)** | **Report V1** tant que l’auth applicative et le modèle `user_id` sur les sélections ne sont pas validés ; la sélection d’articles reste **partagée** par défaut. Voir `docs/plan.md` §10. |
| **Déploiement / recette** | Après merge sur la branche de travail (ex. `v2/media-watch`), pousser vers GitHub et vérifier le build Railway ; recette manuelle : édition → sujet → rédaction, Panorama, Articles, Régie (`docs/plan.md` §11). |
| **Prototype vs prod** | `design/revue-playground` sert de **miroir** pour itérer ; la **vérité** visuelle reste `frontend/src` + `globals.css` + `DESIGN_SYSTEM/`. |
